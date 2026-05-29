import { getGitHubUser } from "../github.server";
import type { Route } from "./+types/api.github-user";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const username = (url.searchParams.get("username") ?? "").trim().replace(/^@/, "");
  if (!username) {
    return Response.json({ exists: false });
  }

  const user = await getGitHubUser(username);
  if (!user) {
    return Response.json({ exists: false });
  }

  return Response.json({
    exists: true,
    login: user.login,
    name: user.name ?? undefined,
    avatarUrl: user.avatarUrl,
  });
}
