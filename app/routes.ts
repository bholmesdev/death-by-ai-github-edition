import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("respond/:scenarioNumber", "routes/respond.tsx"),
  route("suggest", "routes/suggest.tsx"),
  route("api/github-user", "routes/api.github-user.ts"),
] satisfies RouteConfig;
