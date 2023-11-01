export interface IUserInformation {
  userId: string;
  level: "anonymous" | "user" | "privileged";
  /*
   * The time after which the token should be refreshed. (in seconds since 1970-1-1)
   */
  refreshAt?: number;
  /**
   * JWT containing credentials and claims
   */
  token?: string;
}

export interface IServerConfig {
  serverUrl: string;
  auth: string;
}

/**
 * Concrete documents have to derive from this class.
 */
export interface SharedState {
  /**
   * Seeds this document with initial data that is then sent to server in the
   * create operation. This is called for the first user who uses the content
   * regardless for permission level. The server validates the operation, so
   * this is safe.
   */
  seed(): void;
}

export interface PresenceData {
  userId: string;
  name: string;
  level: "anonymous" | "user" | "privileged";
}
