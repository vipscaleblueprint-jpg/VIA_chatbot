import { retrieveContext } from "./lib/rag";

const queries = [
    "do you know melinda?",
    "do you know Dr. Melinda?",
    "melinda"
];

console.log("=== MELINDA DEBUG ===");
async function runTest() {
  for (const q of queries) {
    console.log(`\nQuery: "${q}"`);
    const res = await retrieveContext(q);
    if (res.context === "NO_CONTEXT_FOUND") {
      console.log("Result: NOT FOUND");
    } else {
      console.log("Result: FOUND");
      console.log("Detected Topic:", res.detectedTopic);
      // console.log("Context:", res.context);
    }
  }
}

runTest();
