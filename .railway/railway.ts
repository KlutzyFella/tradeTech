import { defineRailway, github, project, service } from "railway/iac";
// This repository manages only its own resources in the environment. Other
// repositories export their own partial name.
// See https://docs.railway.com/infrastructure-as-code#multi-repo-projects
export const partial = "tradetech-server";
export default defineRailway(() => {
  const _tradetechserver = service("@tradetech/server", {
    source: github("KlutzyFella/tradeTech", { branch: "main", checkSuites: false, rootDirectory: "/" }),
    build: { buildEnvironment: "V3", builder: "DOCKERFILE", dockerfilePath: "Dockerfile", watchPatterns: ["/Dockerfile", "/.railway/**", "/package.json", "/pnpm-lock.yaml", "/pnpm-workspace.yaml", "/tsconfig.base.json", "/apps/server/**", "/apps/web/**", "/packages/**"] },
    start: "/repo/apps/server/docker-entrypoint.sh",
    healthcheck: "/health",
    healthcheckTimeout: 120,
    replicas: { "sfo": 1 },
    networking: { privateNetworkEndpoint: "tradetechserver" },
  });

  return project("laudable-learning", {
    variables: { managed: false },
    resources: [_tradetechserver],
  });
});
