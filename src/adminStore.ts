import { lazy } from "./lazy";
import { Restrict, Store, StoreResult, StoreValue } from "./store";
import { UserStore } from "./userStore";

export class AdminStore extends Store {
  @Restrict("r")
  public user: UserStore;
  @Restrict("none")
  name: string = "John Doe";
  @Restrict("rw")
  getCredentials = lazy(() => {
    const credentialStore = new Store();
    credentialStore.writeEntries({ username: "user1" });
    return credentialStore;
  });

  constructor(user: UserStore) {
    super();
    this.defaultPolicy = "none";
    this.user = user;
  }

  shouldReturnFalseOnMissingKey(key: string): boolean {
    return !(key in this);
  }

  read(path: string): StoreResult {
    const pathArray = path.split(":");

    if (pathArray[0] === "user") {
      return this.user.read(pathArray.slice(1).join(":"));
    }

    if (typeof (this as any)[pathArray[0]] === "function") {
      return this.readFunction(path);
    }

    if (pathArray.length > 1) {
      throw new Error("Not allowed reading nested keys in admin store");
    }

    return super.read(path);
  }

  private readFunction(path: string): StoreResult {
    const pathArray = path.split(":");
    const func = (this as any)[pathArray[0]];
    if (typeof func === "function") {
      const result = func();
      if (typeof result === "object") {
        return result[pathArray[1]];
      }
    }
    return undefined;
  }

  write(path: string, value: StoreValue): StoreValue {
    const pathArray = path.split(":");

    if (pathArray[0] === "user") {
      return this.user.write(pathArray.slice(1).join(":"), value);
    }

    if (pathArray.length > 1) {
      throw new Error("Not allowed writing nested keys in admin store");
    }

    return super.write(path, value);
  }
}
