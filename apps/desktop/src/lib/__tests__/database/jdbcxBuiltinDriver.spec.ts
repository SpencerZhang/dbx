import { describe, expect, it, vi } from "vitest";
import { ensureJdbcxRuntimeDrivers, isJdbcxRuntimePath } from "@/lib/database/jdbcxBuiltinDriver";
import type { ConnectionConfig, JdbcMavenBundleInfo } from "@/types/database";

function jdbcxConfig(): ConnectionConfig {
  return {
    id: "jdbcx-1",
    name: "JDBCX database",
    db_type: "jdbc",
    driver_profile: "jdbcx",
    driver_label: "JDBCX",
    host: "",
    port: 0,
    username: "root",
    password: "",
    connection_string: "jdbcx:prql:vendor://127.0.0.1:1234/test",
    jdbc_driver_paths: [],
  };
}

function runtimeApi(paths: string[], bundles: JdbcMavenBundleInfo[] = []) {
  return {
    listJdbcMavenBundles: async () => bundles,
    listJdbcDrivers: async () => paths.map((path) => ({ name: path.split("/").at(-1) ?? path, path, size: 1 })),
    jdbcPluginStatus: async () => ({ installed: true, compatible: true }),
    installJdbcPlugin: vi.fn(async () => undefined),
  };
}

describe("jdbcxBuiltinDriver", () => {
  it("recognizes user-installed JDBCX runtime JARs", () => {
    expect(isJdbcxRuntimePath("/drivers/jdbcx-driver-0.8.0.jar")).toBe(true);
    expect(isJdbcxRuntimePath("C:\\drivers\\jdbcx-core-0.8.0.jar")).toBe(false);
    expect(isJdbcxRuntimePath("/drivers/postgresql-42.7.7.jar")).toBe(false);
  });

  it("uses the user-installed JDBCX runtime without unrelated driver JARs", async () => {
    const config = jdbcxConfig();
    config.jdbc_driver_paths = ["/drivers/postgresql-42.7.7.jar"];
    const result = await ensureJdbcxRuntimeDrivers(config, runtimeApi(["/drivers/jdbcx-driver-0.8.0.jar", "/drivers/acme-proprietary-driver.jar"]));

    expect(result?.paths).toEqual(["/drivers/postgresql-42.7.7.jar", "/drivers/jdbcx-driver-0.8.0.jar"]);
    expect(config.jdbc_driver_paths).toEqual(result?.paths);
  });

  it("adds the complete installed JDBCX Maven bundle to the selected vendor classpath", async () => {
    const config = jdbcxConfig();
    config.jdbc_driver_paths = ["/drivers/mysql-connector-j-9.2.0.jar"];
    const bundle: JdbcMavenBundleInfo = {
      id: "jdbcx-0.8.0",
      coordinate: "io.github.jdbcx:jdbcx-driver:0.8.0",
      scope: "runtime",
      repositories: ["https://repo.maven.apache.org/maven2/"],
      installed_at: "2026-07-15T00:00:00Z",
      path: "/drivers/jdbcx",
      artifacts: [
        {
          group_id: "io.github.jdbcx",
          artifact_id: "jdbcx-driver",
          version: "0.8.0",
          classifier: "",
          extension: "jar",
          file_name: "jdbcx-driver-0.8.0.jar",
          path: "/drivers/jdbcx-driver-0.8.0.jar",
          size: 1,
          sha256: "abc",
        },
      ],
    };

    const result = await ensureJdbcxRuntimeDrivers(config, runtimeApi([], [bundle]));

    expect(result?.paths).toEqual(["/drivers/mysql-connector-j-9.2.0.jar", "/drivers/jdbcx-driver-0.8.0.jar"]);
  });

  it("asks the user to install JDBCX when its runtime is missing", async () => {
    await expect(ensureJdbcxRuntimeDrivers(jdbcxConfig(), runtimeApi(["/drivers/mysql-connector-j-9.2.0.jar"]))).rejects.toThrow("Install io.github.jdbcx:jdbcx-driver:<version> in Driver Store");
  });
});
