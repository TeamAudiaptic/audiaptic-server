#!/usr/bin/env python3
"""Append a merged PR's changelog entries to this repo's CHANGELOG.yml.

Parses the "## Changelog entry(s)" section of the org pull request template:

    ## Changelog entry(s)

    - X **Feature:** Something new
    - X **Fix:** Something that was broken

HTML comments are stripped before parsing, so the untouched template lines
(which contain only "<!-- Describe ... -->") record nothing. Deleting the
section entirely also records nothing. Neither case is an error.

Reads everything from the environment so untrusted PR text is never
interpolated into a shell command:

    PR_BODY    the pull request description
    PR_NUMBER  the pull request number
    PR_AUTHOR  the GitHub login of whoever opened it
    PR_URL     link back to the pull request
"""

import os
import re
import sys
from datetime import datetime, timezone

import yaml

CHANGELOG_PATH = os.environ.get("CHANGELOG_PATH", "CHANGELOG.yml")

# Label in the PR template -> (key stored in YAML, emoji, display name).
# Keep in sync with the org-level pull request template and with
# aggregate_changelog.py in audiaptic-docs.
TYPES = {
    "feature": ("feature", "\u2728", "Feature"),
    "fix": ("fix", "\U0001F41B", "Fix"),
    "performance": ("perf", "\u26A1", "Performance"),
    "refactor": ("refactor", "\u267B\uFE0F", "Refactor"),
    "documentation": ("docs", "\U0001F4DD", "Documentation"),
    "maintenance": ("maintenance", "\U0001F527", "Maintenance"),
    "breaking change": ("breaking", "\U0001F4A5", "Breaking change"),
}

# Tolerated aliases, so a teammate typing the obvious thing still works.
ALIASES = {
    "feat": "feature",
    "features": "feature",
    "bugfix": "fix",
    "bug fix": "fix",
    "fixes": "fix",
    "perf": "performance",
    "docs": "documentation",
    "doc": "documentation",
    "chore": "maintenance",
    "maint": "maintenance",
    "breaking": "breaking change",
    "breaking changes": "breaking change",
}

HTML_COMMENT = re.compile(r"<!--.*?-->", re.DOTALL)
HEADING = re.compile(r"^\s{0,3}#{1,6}\s+(?P<text>.*?)\s*#*\s*$")
CHANGELOG_HEADING = re.compile(r"changelog", re.IGNORECASE)
HORIZONTAL_RULE = re.compile(r"^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$")

# "- <emoji> **Feature:** message"  (colon inside or outside the bold)
BOLD_ITEM = re.compile(
    r"^\s*[-*+]\s+(?:[^*\n]*?)?\*\*\s*(?P<label>[^*:]+?)\s*:?\s*\*\*\s*:?\s*(?P<message>.*?)\s*$"
)

# Fallback for someone who drops the bold: "- Fix: message"
PLAIN_ITEM = re.compile(
    r"^\s*[-*+]\s+(?:[^\w\s]*\s*)?(?P<label>[A-Za-z][A-Za-z ]*?)\s*:\s*(?P<message>.*?)\s*$"
)


def resolve_type(label):
    """Map a template label to (key, emoji, display name), or None."""
    key = label.strip().lower().rstrip(":").strip()
    key = ALIASES.get(key, key)
    return TYPES.get(key)


def parse_block(body):
    """Return a list of {"type", "emoji", "label", "message"} from a PR body."""
    if not body:
        return []

    text = HTML_COMMENT.sub("", body.replace("\r\n", "\n").replace("\r", "\n"))
    lines = text.split("\n")

    start = None
    for index, line in enumerate(lines):
        heading = HEADING.match(line)
        if heading and CHANGELOG_HEADING.search(heading.group("text")):
            start = index
            break

    if start is None:
        return []

    changes = []
    for line in lines[start + 1:]:
        # The section ends at the next heading or horizontal rule.
        if HEADING.match(line) or HORIZONTAL_RULE.match(line):
            break

        if not line.strip():
            continue

        item = BOLD_ITEM.match(line) or PLAIN_ITEM.match(line)
        if not item:
            continue

        resolved = resolve_type(item.group("label"))
        if not resolved:
            continue

        message = item.group("message").strip()
        # Strip stray markdown emphasis and trailing punctuation-only leftovers.
        message = message.strip("*").strip()

        if not message:
            # An untouched template line, now that its comment is gone.
            continue

        key, emoji, display = resolved
        changes.append({
            "type": key,
            "emoji": emoji,
            "label": display,
            "message": message,
        })

    return changes


def load_changelog(path):
    if not os.path.exists(path):
        return {"entries": []}

    with open(path, "r", encoding="utf-8") as handle:
        data = yaml.safe_load(handle) or {}

    if not isinstance(data, dict) or not isinstance(data.get("entries"), list):
        return {"entries": []}

    return data


def main():
    body = os.environ.get("PR_BODY", "")
    author = os.environ.get("PR_AUTHOR", "unknown")
    url = os.environ.get("PR_URL", "")

    try:
        number = int(os.environ["PR_NUMBER"])
    except (KeyError, ValueError):
        print("PR_NUMBER is missing or not a number.", file=sys.stderr)
        return 1

    changes = parse_block(body)

    if not changes:
        print("No changelog entries in PR #%d - nothing to record." % number)
        return 0

    data = load_changelog(CHANGELOG_PATH)

    # Re-running the workflow on the same PR must not duplicate the entry.
    if any(entry.get("pr") == number for entry in data["entries"]):
        print("PR #%d is already in the changelog - skipping." % number)
        return 0

    next_id = max((entry.get("id", 0) for entry in data["entries"]), default=0) + 1

    data["entries"].append({
        "id": next_id,
        "pr": number,
        "author": author,
        "time": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S+00:00"),
        "url": url,
        "changes": changes,
    })

    with open(CHANGELOG_PATH, "w", encoding="utf-8") as handle:
        yaml.safe_dump(
            data,
            handle,
            sort_keys=False,
            allow_unicode=True,
            default_flow_style=False,
            width=10000,
        )

    print("Recorded %d change(s) from PR #%d as entry %d."
          % (len(changes), number, next_id))
    return 0


if __name__ == "__main__":
    sys.exit(main())
