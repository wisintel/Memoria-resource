const featureFolders = ["graph", "inspector", "intake", "pipeline", "shelf", "workbench"];

const featureBoundaryRules = featureFolders.flatMap((fromFeature) =>
  featureFolders
    .filter((toFeature) => toFeature !== fromFeature)
    .map((toFeature) => ({
      name: `no-${fromFeature}-to-${toFeature}`,
      severity: "error",
      from: { path: `^src/features/${fromFeature}/` },
      to: { path: `^src/features/${toFeature}/` }
    }))
);

module.exports = {
  forbidden: [
    {
      name: "no-app-tier-imports",
      severity: "error",
      from: { path: "^src/(features|lib)/" },
      to: { path: "^src/(App\\.tsx|shell/)" }
    },
    {
      name: "no-lib-to-features",
      severity: "error",
      from: { path: "^src/lib/" },
      to: { path: "^src/features/" }
    },
    ...featureBoundaryRules
  ],
  options: {
    doNotFollow: {
      path: "node_modules"
    },
    enhancedResolveOptions: {
      extensions: [".ts", ".tsx", ".js", ".jsx", ".json"]
    },
    tsConfig: {
      fileName: "tsconfig.json"
    }
  }
};
