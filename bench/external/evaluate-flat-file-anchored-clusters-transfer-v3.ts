/** Select the frozen v3 configuration before loading the shared blind runner. */
process.env.HUNCH_FILE_CLUSTER_TRANSFER_VERSION = "v3";
await import("./evaluate-file-first-declaration-clusters-transfer-v1.js");
