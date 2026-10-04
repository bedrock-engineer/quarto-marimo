from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from quarto_marimo import prerender

if TYPE_CHECKING:
    from pathlib import Path

NOTEBOOK = """import marimo

__generated_with = "0.24.0"
app = marimo.App(width="medium")


@app.cell
def _():
    value = 1
    return
"""

EXPORTED = """---
title: Getting Started
marimo-version: 0.24.2
width: medium
header: |-
  # /// script
  # dependencies = [
  #     "marimo",
  # ]
  # ///
---

```{marimo .python}
value = 1
```
"""

EXPORTED_WITH_HEADING = EXPORTED.replace(
    "---\n\n```", "---\n\n# Getting started with Demo\n\nIntro paragraph.\n\n```"
)


def write_notebook(path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(NOTEBOOK, encoding="utf-8")
    return path


def test_find_notebooks_skips_what_quarto_ignores(tmp_path):
    write_notebook(tmp_path / "docs/getting_started.py")
    write_notebook(tmp_path / "docs/examples/beam.py")
    write_notebook(tmp_path / "docs/_drafts/hidden.py")
    write_notebook(tmp_path / "_site/copy.py")
    (tmp_path / "docs/helper.py").write_text("def helper():\n    return 1\n", "utf-8")

    found = prerender.find_notebooks(tmp_path)

    assert [path.relative_to(tmp_path).as_posix() for path in found] == [
        "docs/examples/beam.py",
        "docs/getting_started.py",
    ]


def test_output_path_keeps_the_notebook_location(tmp_path):
    notebook = tmp_path / "docs/examples/beam_analysis.py"

    assert (
        prerender.output_path(notebook) == tmp_path / "docs/examples/beam-analysis.qmd"
    )


def test_frontmatter_points_at_the_keys_the_engine_reads():
    front = prerender.rewrite_frontmatter(
        "title: Getting Started\nmarimo-version: 0.24.2\nheader: |-\n  # /// script\n  # ///\n"
    )

    assert front == (
        "title: Getting Started\n"
        "pyproject: |\n"
        "  # /// script\n"
        "  # ///\n"
        "echo: true\n"
        "error: false\n"
    )


def test_a_promoted_title_replaces_the_exporters_title():
    front = prerender.rewrite_frontmatter(
        "title: Getting Started\nwidth: medium\n", title="Getting started: SymEval"
    )

    assert front == (
        'title: "Getting started: SymEval"\nwidth: medium\necho: true\nerror: false\n'
    )


def test_a_leading_heading_becomes_the_title():
    title, body = prerender.promote_title("\n# Getting started with Demo\n\nIntro.\n")

    assert title == "Getting started with Demo"
    assert body == "Intro.\n"


def test_the_heading_may_follow_the_notebook_imports():
    body = (
        "```{marimo .python}\nimport marimo as mo\n```\n\n"
        "# 1 - The database\n\nIntro.\n\n# Not the title\n"
    )

    title, rest = prerender.promote_title(body)

    assert title == "1 - The database"
    assert (
        rest
        == "```{marimo .python}\nimport marimo as mo\n```\n\nIntro.\n\n# Not the title\n"
    )


def test_a_heading_inside_a_cell_is_not_a_title():
    body = '```{marimo .python}\nmo.md("# Inside")\n```\n\nIntro.\n'

    assert prerender.promote_title(body) == (None, body)


def test_a_body_without_a_leading_heading_keeps_the_exporters_title():
    body = "Intro first.\n\n# Not the title\n"

    assert prerender.promote_title("\n" + body) == (None, body)


def test_convert_rewrites_frontmatter_and_keeps_the_body(tmp_path, monkeypatch):
    notebook = write_notebook(tmp_path / "page.py")
    monkeypatch.setattr(prerender, "export_markdown", lambda _notebook: EXPORTED)

    page = prerender.convert(notebook)

    assert page.startswith("---\ntitle: Getting Started\n")
    assert "pyproject: |" in page
    assert "marimo-version" not in page
    assert "```{marimo .python}\nvalue = 1\n```" in page


def test_convert_titles_the_page_after_its_leading_heading(tmp_path, monkeypatch):
    notebook = write_notebook(tmp_path / "getting_started.py")
    monkeypatch.setattr(
        prerender, "export_markdown", lambda _notebook: EXPORTED_WITH_HEADING
    )

    page = prerender.convert(notebook)

    _, front, body = page.split("---\n", 2)
    assert 'title: "Getting started with Demo"' in front
    assert "Getting Started" not in front
    assert body.startswith("\nIntro paragraph.\n")
    assert "# Getting started" not in body


def test_convert_runs_the_transform_on_the_body_only(tmp_path, monkeypatch):
    notebook = write_notebook(tmp_path / "page.py")
    monkeypatch.setattr(prerender, "export_markdown", lambda _notebook: EXPORTED)

    page = prerender.convert(notebook, lambda body, _path: f"::: badge\n:::\n{body}")

    _, front, body = page.split("---\n", 2)
    assert "badge" not in front
    assert body.startswith("\n::: badge\n:::\n")
    assert "```{marimo .python}\nvalue = 1\n```" in body


def test_unchanged_pages_are_not_rewritten(tmp_path, monkeypatch):
    notebook = write_notebook(tmp_path / "page.py")
    monkeypatch.setattr(prerender, "export_markdown", lambda _notebook: EXPORTED)

    assert prerender.convert_all(tmp_path) == [tmp_path / "page.qmd"]
    # quarto preview watches its inputs, so a no-op render must not touch them.
    assert prerender.convert_all(tmp_path) == []


def test_export_failure_reports_marimo_stderr(tmp_path, monkeypatch):
    notebook = write_notebook(tmp_path / "page.py")

    def fail(_notebook):
        raise RuntimeError("marimo exploded")

    monkeypatch.setattr(prerender, "export_markdown", fail)

    with pytest.raises(RuntimeError, match="marimo exploded"):
        prerender.convert(notebook)
