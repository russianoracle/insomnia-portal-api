import axios, { AxiosInstance } from "axios";
import dotenv from "dotenv";
import { generateMockResponse } from "./mock.js";

dotenv.config();

const API_URL = process.env.EFLOW_API_URL || "https://dev-eflow-api.astrazenecacloud.ru";
const API_TOKEN = process.env.EFLOW_API_TOKEN;
const MOCK_MODE = process.env.EFLOW_MOCK_MODE === "true";

export const client: AxiosInstance = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
    ...(API_TOKEN ? { Authorization: `Bearer ${API_TOKEN}` } : {}),
  },
});

export async function executeRequest(
  method: string,
  path: string,
  args: any,
  parameters: any[] = [],
  metadata?: any,
  responseSchema?: any // New parameter for Mock Mode
) {
  // --- MOCK MODE LOGIC ---
  if (MOCK_MODE) {
    const mockData = await generateMockResponse(responseSchema);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(mockData, null, 2),
        },
      ],
      _meta: { ...metadata, mocked: true },
    };
  }

  // --- REAL REQUEST LOGIC ---
  let url = path;
  const query: Record<string, any> = {};
  const headers: Record<string, any> = {};
  let body: any = undefined;

  for (const param of parameters) {
    const value = args[param.name];
    if (value === undefined) continue;

    if (param.in === "path") {
      url = url.replace(`{${param.name}}`, String(value));
    } else if (param.in === "query") {
      query[param.name] = value;
    } else if (param.in === "header") {
      headers[param.name] = value;
    }
  }

  if (args.requestBody) {
    body = args.requestBody;
  } else {
    body = args;
  }

  try {
    const response = await client.request({
      method,
      url,
      params: query,
      headers,
      data: body,
    });

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(response.data, null, 2),
        },
      ],
      _meta: metadata,
    };
  } catch (error: any) {
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: error.response
            ? `API Error (${error.response.status}): ${JSON.stringify(error.response.data)}`
            : `Network Error: ${error.message}`,
        },
      ],
      _meta: metadata,
    };
  }
}
