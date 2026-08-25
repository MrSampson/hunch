/** Run the v3 preregistered configuration through the shared blind evaluator. */
process.env.HUNCH_EVIDENCE_BRIDGE_TRANSFER_VERSION = "v3";
await import("./evaluate-evidence-file-reserve-transfer-v2.js");
