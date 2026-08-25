/** Select the frozen v2 configuration before loading the shared blind runner. */
process.env.HUNCH_FILE_CLUSTER_TRANSFER_VERSION = "v2";
await import("./evaluate-file-first-declaration-clusters-transfer-v1.js");
