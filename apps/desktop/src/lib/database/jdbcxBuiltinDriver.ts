import type { ConnectionConfig, JdbcDriverInfo, JdbcMavenBundleInfo } from "@/types/database";

export const JDBCX_DRIVER_PROFILE = "jdbcx";
export const JDBCX_JDBC_DRIVER_CLASS = "io.github.jdbcx.WrappedDriver";
export const JDBCX_DEFAULT_URL = "jdbcx:";

export type JdbcxRuntimeDriverApi = {
  listJdbcDrivers: () => Promise<JdbcDriverInfo[]>;
  listJdbcMavenBundles: () => Promise<JdbcMavenBundleInfo[]>;
  jdbcPluginStatus: () => Promise<{ installed: boolean; compatible: boolean }>;
  installJdbcPlugin: () => Promise<unknown>;
};

export type JdbcxRuntimeDriverResult = {
  bundles: JdbcMavenBundleInfo[];
  paths: string[];
};

export function isJdbcxRuntimePath(path: string): boolean {
  return /(?:^|[/\\])jdbcx-driver(?:-|\.)/i.test(path);
}

function isJdbcxRuntimeBundle(bundle: JdbcMavenBundleInfo): boolean {
  const [groupId, artifactId] = bundle.coordinate.split(":");
  return groupId === "io.github.jdbcx" && artifactId === "jdbcx-driver";
}

export async function ensureJdbcxRuntimeDrivers(config: ConnectionConfig, api: JdbcxRuntimeDriverApi, onInstalling?: (coordinates: string[]) => void): Promise<JdbcxRuntimeDriverResult | undefined> {
  if (config.db_type !== "jdbc" || config.driver_profile !== JDBCX_DRIVER_PROFILE) return undefined;

  config.connection_string = config.connection_string?.trim() || JDBCX_DEFAULT_URL;
  config.jdbc_driver_class = config.jdbc_driver_class?.trim() || JDBCX_JDBC_DRIVER_CLASS;
  const configuredPaths = (config.jdbc_driver_paths ?? []).map((path) => path.trim()).filter(Boolean);
  const pluginStatus = await api.jdbcPluginStatus();
  if (!pluginStatus.installed || !pluginStatus.compatible) {
    onInstalling?.([]);
    await api.installJdbcPlugin();
  }

  const [bundles, installedDrivers] = await Promise.all([api.listJdbcMavenBundles(), api.listJdbcDrivers()]);
  const bundleRuntimePaths = bundles.filter(isJdbcxRuntimeBundle).flatMap((bundle) => bundle.artifacts.map((artifact) => artifact.path).filter(Boolean));
  const standaloneRuntimePaths = installedDrivers.filter((driver) => !driver.bundle_id && isJdbcxRuntimePath(driver.path)).map((driver) => driver.path);
  const runtimePaths = Array.from(new Set([...bundleRuntimePaths, ...standaloneRuntimePaths]));
  const paths = Array.from(new Set([...configuredPaths, ...runtimePaths]));
  if (!paths.some(isJdbcxRuntimePath)) {
    throw new Error("JDBCX runtime is not installed. Install io.github.jdbcx:jdbcx-driver:<version> in Driver Store, then retry.");
  }

  // JDBCX discovers the delegate driver through JDBC ServiceLoader/Driver.acceptsURL.
  // Keep the classpath scoped to the connection-selected vendor driver and the
  // JDBCX runtime so unrelated driver dependencies cannot conflict.
  config.jdbc_driver_paths = paths;
  return { bundles, paths };
}
