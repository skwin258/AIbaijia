import { readFile, writeFile } from "node:fs/promises";

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const apiToken = process.env.CLOUDFLARE_API_TOKEN;
const namespaceTitle = process.env.CLOUDFLARE_KV_NAMESPACE || "SK_DATA";
const previewNamespaceTitle = process.env.CLOUDFLARE_PREVIEW_KV_NAMESPACE || `${namespaceTitle}_PREVIEW`;

if (!accountId || !apiToken) {
  throw new Error("CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required.");
}

const apiBase = `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces`;

async function cloudflare(path = "", options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${apiToken}`,
      "content-type": "application/json",
      ...options.headers,
    },
  });
  const payload = await response.json();
  if (!response.ok || !payload.success) {
    throw new Error(payload.errors?.map((error) => error.message).join("; ") || `Cloudflare API failed: ${response.status}`);
  }
  return payload.result;
}

async function getOrCreateNamespace(title) {
  let page = 1;
  for (;;) {
    const namespaces = await cloudflare(`?page=${page}&per_page=100`);
    const match = namespaces.find((namespace) => namespace.title === title);
    if (match) return match.id;
    if (namespaces.length < 100) break;
    page += 1;
  }

  const created = await cloudflare("", {
    method: "POST",
    body: JSON.stringify({ title }),
  });
  return created.id;
}

const [productionId, previewId] = await Promise.all([
  getOrCreateNamespace(namespaceTitle),
  getOrCreateNamespace(previewNamespaceTitle),
]);

const configPath = "wrangler.jsonc";
const config = await readFile(configPath, "utf8");
await writeFile(
  configPath,
  config
    .replace("REPLACE_WITH_PRODUCTION_KV_ID", productionId)
    .replace("REPLACE_WITH_PREVIEW_KV_ID", previewId),
);

console.log(`Prepared Cloudflare KV namespace "${namespaceTitle}" (${productionId}).`);
