import ReconnectingWebSocket from "reconnecting";
import { Connection, Doc } from "sharedb/lib/client";
import { H5P } from "h5p-utils";

import { IServerConfig, IUserInformation, SharedState } from "./types";

/**
 * This class abstracts the connection to ShareDB for the library. It is
 * reusable across content types.
 */
export default class SharedStateClient<T extends SharedState> {
  constructor(
    contentId: string,
    private refreshCallback: (data: T) => Promise<void>,
    private T: { new (): T }
  ) {
    // The shared-state server configuration is provided by the H5P plugin of
    // the host system. (Must be configured there)
    const serverConfig: IServerConfig = H5P.getLibraryConfig(
      "H5P.ShareDBTest"
    ) as IServerConfig;

    // Initialize connection to ShareDB server
    this.socket = new ReconnectingWebSocket(async () => {
      // We need to make sure the user information is up to date before every
      // web socket connect as the token (and user privileges) might change.
      if (
        !this.userInformation ||
        (this.userInformation.refreshAt !== undefined &&
          this.userInformation.refreshAt <= Date.now() / 1000)
      ) {
        const auth = await fetch(serverConfig.auth + contentId, {
          mode: "cors",
          credentials: "include",
        });
        this.userInformation = await auth.json();
        if (!this.userInformation) {
          throw new Error("Received invalid user information from server");
        }
      }
      return this.userInformation.token
        ? `${serverConfig.serverUrl}?token=${this.userInformation.token}`
        : serverConfig.serverUrl;
    });

    this.connection = new Connection(this.socket as any);

    // Create local doc instance mapped to 'h5p' collection document with
    // contentId
    this.doc = this.connection.get("h5p", contentId.toString());

    // Get initial value of document and subscribe to changes
    this.doc.subscribe(this.refresh);

    // When document changes (by this client or any other, or the server),
    // update the number on the page
    this.doc.on("op", this.refresh);
  }

  public userInformation?: IUserInformation;

  private socket: ReconnectingWebSocket;
  private connection: Connection;
  private doc: Doc<T>;

  refresh = async () => {
    if (this.doc.type === null) {
      // If there is no document type, this means that no document has been
      // created so far. The first user who encounters this creates a new
      // document by seeding it and submitting the create op.
      const newDoc = new this.T();
      newDoc.seed();
      this.doc.create(newDoc, async (error) => {
        if (error) {
          console.error("Error while creating ShareDB doc: ", error);
        } else {
          await this.refreshCallback(this.doc.data);
        }
      });
    } else {
      await this.refreshCallback(this.doc.data);
    }
  };

  /**
   * Sends an operation to the server and optimistically applies the change to
   * the local document. Should the operation fail on the server, ShareDB will
   * revert the local change automatically and update the state (this calls q
   * refreshCallback).
   * @param data an operation; normally this is a JSON0 op; see
   * <https://github.com/ottypes/json0> for details
   */
  submitOp = (data: any) => {
    this.doc.submitOp(data);
  };
}
