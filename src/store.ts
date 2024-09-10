import { JSONArray, JSONObject, JSONPrimitive } from "./json-types";
import "reflect-metadata";

export type Permission = "r" | "w" | "rw" | "none";

export type PermissionKey = { [key: string]: Permission };

export type StoreResult = Store | JSONPrimitive | undefined;

export type StoreValue =
  | JSONObject
  | JSONArray
  | StoreResult
  | (() => StoreResult);

export interface IStore {
  defaultPolicy: Permission;
  shouldReturnFalseOnMissingKey(key: string): boolean;
  allowedToRead(key: string): boolean;
  allowedToWrite(key: string): boolean;
  read(path: string): StoreResult;
  write(path: string, value: StoreValue): StoreValue;
  writeEntries(entries: JSONObject): void;
  entries(): JSONObject;
}

export const PERMISSION_KEY = Symbol("permissions");

export const Restrict = (permission?: Permission): any => {
  return (target: any, propertyKey: string): void => {
    if (permission !== undefined) {
      Reflect.defineMetadata(PERMISSION_KEY, permission, target, propertyKey);

      let value: StoreValue = target[propertyKey];

      const getter = (): StoreValue => {
        const currentPermission: Permission = Reflect.getMetadata(
          PERMISSION_KEY,
          target,
          propertyKey
        );
        if (currentPermission === "r" || currentPermission === "rw") {
          return value;
        } else {
          throw new Error(`Reading permission needed to access ${propertyKey}`);
        }
      };

      const setter = (newValue: StoreValue): void => {
        const currentPermission: Permission = Reflect.getMetadata(
          PERMISSION_KEY,
          target,
          propertyKey
        );
        const isInConstructor: boolean = target.constructor;

        if (
          isInConstructor ||
          currentPermission === "w" ||
          currentPermission === "rw"
        ) {
          value = newValue;
        } else {
          throw new Error(`Writing permission needed to modify ${propertyKey}`);
        }
      };

      Object.defineProperty(target, propertyKey, {
        get: getter,
        set: setter,
        configurable: true,
        enumerable: true,
      });
    }
  };
};

export class Store implements IStore {
  defaultPolicy: Permission = "rw";

  private getPermission(key: string): Permission {
    return Reflect.getMetadata(PERMISSION_KEY, this, key) || this.defaultPolicy;
  }

  private hasPermission(
    key: string,
    allowedPermissions: Permission[]
  ): boolean {
    if (this.shouldReturnFalseOnMissingKey(key)) {
      return false;
    }
    const permission = this.getPermission(key);
    return allowedPermissions.includes(permission);
  }

  shouldReturnFalseOnMissingKey(key: string): boolean {
    return false;
  }

  allowedToRead(key: string): boolean {
    return this.hasPermission(key, ["r", "rw"]);
  }

  allowedToWrite(key: string): boolean {
    return this.hasPermission(key, ["w", "rw"]);
  }

  read(path: string): StoreResult {
    const pathArray = path.split(":");

    if (!this.allowedToRead(pathArray[0])) {
      throw new Error("Not allowed to read");
    }

    let lastObject: any = this;

    for (const key of pathArray) {
      if (lastObject === undefined || lastObject === null) {
        throw new Error(`Property '${key}' does not exist`);
      }

      lastObject = lastObject[key];

      // If property is a function (like lazy), we execute it
      if (typeof lastObject === "function") {
        lastObject = lastObject();
      }

      // If the object is a classic structure, we convert it to a Store
      if (
        typeof lastObject === "object" &&
        lastObject !== null &&
        !(lastObject instanceof Store)
      ) {
        Object.setPrototypeOf(lastObject, Store.prototype);

        // Add default Policy if missing
        if (!lastObject.defaultPolicy) {
          lastObject.defaultPolicy = this.defaultPolicy;
        }
      }
    }

    return lastObject;
  }

  write(path: string, value: StoreValue): StoreValue {
    const pathArray = path.split(":");

    if (!this.allowedToWrite(pathArray[0])) {
      throw new Error("Write permission denied for " + pathArray[0]);
    }

    let lastObject: any = this;

    for (let i = 0; i < pathArray.length - 1; i++) {
      const key = pathArray[i];

      // We ensure that intermediate properties are objects
      if (lastObject[key] && typeof lastObject[key] !== "object") {
        throw new Error(`Cannot assign to non-object property: ${key}`);
      }

      // If the property does not exist, an empty object is initialized
      if (!lastObject[key]) {
        lastObject[key] = {};
      }

      lastObject = lastObject[key];
    }

    // Assign value to last key in path
    const lastKey = pathArray[pathArray.length - 1];
    lastObject[lastKey] = value;

    return value;
  }

  writeEntries(entries: JSONObject): void {
    Object.assign(this, entries);
  }

  entries(): JSONObject {
    const result: JSONObject = {};
    for (const key in this) {
      const permission = this.getPermission(key);
      if (permission !== "none") {
        try {
          result[key] = (this as any)[key];
        } catch (error) {}
      }
    }
    return result;
  }
}
