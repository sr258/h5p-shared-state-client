import ReconnectingWebSocket from "reconnecting";
import { Connection, Doc } from "sharedb/lib/client";
import { H5P } from "h5p-utils";

import {
  IServerConfig,
  IUserInformation,
  PresenceData,
  SharedState,
} from "./types";
import { LocalPresence } from "sharedb/lib/sharedb";

/**
 * This class abstracts the connection to ShareDB for the library. It is
 * reusable across content types.
 */
export default class SharedStateClient<
  StateType extends SharedState,
  PresenceType extends PresenceData | null = null
> {
  constructor(
    private StateType: { new (): StateType },
    private contentId: string,
    private callbacks: {
      onRefresh: (data: StateType) => Promise<void>;
      onRefreshPresences?: (presences: {
        [id: string]: PresenceType;
      }) => Promise<void>;
      onConnected?: (data: StateType) => Promise<void>;
      onDeleted?: () => Promise<void>;
      onError?: (error: string) => Promise<void>;
    },
    options?: { enablePresence: boolean }
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
        if (options?.enablePresence) {
          this.initPresence();
        }
      }
      return this.userInformation.token
        ? `${serverConfig.serverUrl}?token=${this.userInformation.token}`
        : serverConfig.serverUrl;
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.connection = new Connection(this.socket as any);

    // Create local doc instance mapped to 'h5p' collection document with
    // contentId
    this.doc = this.connection.get("h5p", contentId.toString());

    // Get initial value of document and subscribe to changes
    this.doc.subscribe(this.refresh);

    // When document changes (by this client or any other, or the server),
    // update
    this.doc.on("op batch", this.refresh);

    // We need to stop user interaction and notify the user when the state was
    // deleted
    this.doc.on("del", async () => {
      await this.onDeleted();
    });

    // Notify the user when there are errors
    this.socket.onerror = async (error) => {
      this.hadError = true;
      await this.onError(error.message ?? "No websocket connection to server");
    };

    // Return to regular view when error was resolved
    this.socket.onopen = async () => {
      if (this.hadError) {
        await this.onConnected(this.doc.data);
        await this.callbacks?.onRefresh(this.doc.data);
        this.hadError = false;
      }
    };
  }

  public userInformation?: IUserInformation;

  private socket: ReconnectingWebSocket;
  private connection: Connection;
  private doc: Doc<StateType>;
  private initial = true;
  private hadError = false;
  private myPresence!: LocalPresence<PresenceType>;
  private otherPresences: { [id: string]: PresenceType } = {};

  refresh = async () => {
    if (this.doc.type === null) {
      // If there is no document type, this means that no document has been
      // created so far. The first user who encounters this creates a new
      // document by seeding it and submitting the create op.
      const newDoc = new this.StateType();
      newDoc.seed();
      this.doc.create(newDoc, async (error) => {
        if (error) {
          console.error("Error while creating ShareDB doc: ", error);
          return;
        } else {
          await this.onConnected(newDoc);
          await this.callbacks?.onRefresh(this.doc.data);
        }
      });
    } else {
      if (this.initial) {
        this.initial = false;
        await this.onConnected(this.doc.data);
      }
      await this.callbacks?.onRefresh(this.doc.data);
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
  submitOp = (data: unknown) => {
    this.doc.submitOp(data);
  };

  submitPresence = async (data: PresenceType) => {
    this.myPresence.submit(data, (err) => {
      if (err) {
        console.error("Error while submitting presence", err);
      }
    });
  };

  private onConnected = async (data: StateType): Promise<void> => {
    if (this.callbacks?.onConnected) {
      await this.callbacks?.onConnected(data);
    }
  };

  private onError = async (message: string): Promise<void> => {
    if (this.callbacks?.onError) {
      await this.callbacks?.onError(message);
    }
  };

  private onDeleted = async (): Promise<void> => {
    if (this.callbacks?.onDeleted) {
      await this.callbacks?.onDeleted();
    }
  };

  private initPresence = async (): Promise<void> => {
    const presence = this.connection.getPresence(this.contentId.toString());
    presence.subscribe();
    presence.on("receive", async (presenceId, update) => {
      console.log(
        "Received presence with id",
        presenceId,
        ". Updated value: ",
        update
      );
      if (!update) {
        delete this.otherPresences[presenceId];
      } else {
        this.otherPresences[presenceId] = update;
      }
      if (this.callbacks.onRefreshPresences) {
        await this.callbacks.onRefreshPresences(this.otherPresences);
      }
    });

    this.myPresence = presence.create();
  };
}
