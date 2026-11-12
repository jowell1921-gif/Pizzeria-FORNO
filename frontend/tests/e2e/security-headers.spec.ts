import { expect, test } from "@playwright/test";

test("every page is served with the security headers", async ({ request }) => {
  for (const path of ["/", "/carta", "/acceso"]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    const headers = response.headers();
    expect(headers["x-content-type-options"], path).toBe("nosniff");
    expect(headers["x-frame-options"], path).toBe("DENY");
    expect(headers["referrer-policy"], path).toBe("strict-origin-when-cross-origin");
    expect(headers["permissions-policy"], path).toContain("camera=()");
    expect(headers["strict-transport-security"], path).toContain("max-age=");
  }
});
