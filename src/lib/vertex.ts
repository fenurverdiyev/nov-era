import { GoogleGenAI } from "@google/genai";

/**
 * Initializes the Vertex AI client using Service Account credentials from environment variables.
 * Note: This should ONLY be used in server-side code to avoid exposing the private key.
 */
export function getVertexAI() {
  const saJson = process.env.GOOGLE_SA_JSON;
  if (!saJson) {
    throw new Error("GOOGLE_SA_JSON environment variable is not defined");
  }

  let credentials;
  try {
    credentials = JSON.parse(saJson);
  } catch (error) {
    throw new Error("Failed to parse GOOGLE_SA_JSON environment variable");
  }

  return new GoogleGenAI({
    vertexai: true,
    project: credentials.project_id || "novera-495614",
    location: "us-central1",
    googleAuthOptions: {
      credentials,
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    },
  });
}
