import SharedStateClient from "./SharedStateClient";

export { SharedStateClient };

declare let H5P: any;

// eslint-disable-next-line @typescript-eslint/no-unused-vars, prefer-const
H5P = H5P || {};

H5P.SharedStateClient = SharedStateClient;
