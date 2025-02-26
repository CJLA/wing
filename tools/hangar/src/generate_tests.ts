import { mkdirSync, readdirSync, rmSync, writeFileSync } from "fs";
import { sdkTestsDir, validTestDir } from "./paths";
import { join, extname } from "path";
import { parseMetaCommentFromPath } from "./meta_comment";

const generatedTestDir = join(__dirname, "test_corpus", "valid");
const generatedSDKTestDir = join(__dirname, "test_corpus", "sdk_tests");

rmSync(generatedTestDir, { recursive: true, force: true });
rmSync(generatedSDKTestDir, { recursive: true, force: true });

interface GenerateTestsOptions {
  sourceDir: string;
  destination: string;
  isRecursive?: boolean;
  level?: number;
  includeJavaScriptInSnapshots?: boolean;
}

function generateTests(options: GenerateTestsOptions) {
  const {
    sourceDir,
    destination,
    isRecursive = true,
    level = 0,
    includeJavaScriptInSnapshots = true,
  } = options;
  for (const fileInfo of readdirSync(sourceDir, { withFileTypes: true })) {
    if (fileInfo.isDirectory() && isRecursive) {
      // skip "target" and "node_modules" directories
      if (fileInfo.name === "target" || fileInfo.name === "node_modules") {
        continue;
      }

      generateTests({
        sourceDir: join(sourceDir, fileInfo.name),
        destination: join(destination, fileInfo.name),
        isRecursive,
        level: level + 1,
        includeJavaScriptInSnapshots,
      });
      continue;
    }
    if (!fileInfo.isFile() || extname(fileInfo.name) !== ".w") {
      continue;
    }

    const filename = fileInfo.name;

    const metaComment = parseMetaCommentFromPath(join(sourceDir, filename));

    let skipText = "";

    if (metaComment?.skip) {
      continue;
    }

    if (
      metaComment?.skipPlatforms?.includes(process.platform) &&
      process.env.CI
    ) {
      skipText = ".skip";
    }

    // ensure windows paths are escaped
    const escapedSourceDir = sourceDir.replace(/\\/g, "\\\\");

    const fileContents = `\
  // This file is generated by tools/hangar/src/generate_tests.ts
  
  import { test } from "vitest";
  import { compileTest, testTest } from "${Array(level)
    .fill("../")
    .join("")}../../generated_test_targets";
  
  test${skipText}("wing compile -t tf-aws", async () => {
    await compileTest("${escapedSourceDir}", "${filename}", ${JSON.stringify(
      metaComment?.env
    )}, ${includeJavaScriptInSnapshots});
  });
  
  test${skipText}("wing test -t sim", async () => {
    await testTest("${escapedSourceDir}", "${filename}", ${JSON.stringify(
      metaComment?.env
    )}, ${includeJavaScriptInSnapshots});
  });`;

    mkdirSync(destination, { recursive: true });
    writeFileSync(join(destination, `${filename}.test.ts`), fileContents);
  }
}

generateTests({
  sourceDir: validTestDir,
  destination: generatedTestDir,
  isRecursive: false,
  includeJavaScriptInSnapshots: true,
});
generateTests({
  sourceDir: sdkTestsDir,
  destination: generatedSDKTestDir,
  isRecursive: true,
  includeJavaScriptInSnapshots: false,
});
