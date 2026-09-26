/**
 * Subagent prompt template.
 *
 * Called once per module directory. The subagent MUST return ONLY the
 * SubagentSummary JSON — no prose, no raw file contents — so the
 * orchestrator context stays clean.
 */

export interface SubagentPromptParams {
  modulePath: string;
  /** Relative (to repo root) source file paths assigned to this module */
  files: string[];
  /** Relative test file paths that cover this module (may be empty) */
  testFiles: string[];
  /** Absolute path to the repo root (for git commands) */
  repoRoot: string;
}

export function buildSubagentPrompt(params: SubagentPromptParams): string {
  const { modulePath, files, testFiles, repoRoot } = params;

  const fileList = files.length
    ? files.map((f) => `  - ${f}`).join('\n')
    : '  (none)';

  const testFileList = testFiles.length
    ? testFiles.map((f) => `  - ${f}`).join('\n')
    : '  (none found)';

  return `\
You are a test-gap analysis subagent assigned to module: ${modulePath}
Repo root: ${repoRoot}

ASSIGNED SOURCE FILES (read only these):
${fileList}

EXISTING TEST FILES FOR THIS MODULE:
${testFileList}

YOUR TASK
---------
1. Read every assigned source file using the read_file tool.
2. List every exported function or class method that has NO corresponding
   test in the test files above.
3. For each untested item, compute a risk score using:

     risk_score = 0.4 * recency
                + 0.35 * no_test
                + 0.25 * complexity

   where:
     recency    = 1 if the file was changed in the last 5 git commits, else 0
                  (use: git log --oneline -5 -- <file>  from the repo root)
     no_test    = 1 (always 1 here — we are listing untested items)
     complexity = (count of if / else if / else / switch / case / catch /
                   for / while / do / ternary operators in the function body)
                  divided by 10, capped at 1.0

4. For items with risk_score >= 0.6, write a candidate Vitest test
   (describe + it blocks, no imports beyond vitest and the module under
   test, realistic assertions — not placeholder comments).

5. Return ONLY the following JSON and absolutely nothing else.
   No markdown fences, no explanation, no trailing text:

{
  "module": "${modulePath}",
  "gaps": [
    {
      "target": "<exported function or class.method name>",
      "file": "<source file path relative to repo root>",
      "risk_score": <number between 0 and 1, 2 decimal places>,
      "risk_reasons": [
        "<one short phrase per contributing factor, e.g. 'changed in last 5 commits'>"
      ],
      "draft_test": "<full vitest test code, or empty string if risk_score < 0.6>",
      "draft_rationale": "<one sentence explaining what the test covers>"
    }
  ],
  "files_scanned": <total number of source files you read>,
  "existing_tests_found": <number of test files listed above>
}

CONSTRAINTS
-----------
- Do NOT return file contents, intermediate analysis, or prose.
- Do NOT include gaps for items that already have a corresponding test.
- If a file is empty or has no exported symbols, include it in files_scanned
  but add no gap entry for it.
- Sort gaps array by risk_score descending.
`;
}
