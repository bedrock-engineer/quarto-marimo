from __future__ import annotations

from xml.etree.ElementTree import Element

from marimo._convert.markdown.to_ir import MARIMO_MD
from quarto_marimo.document import collect_page

PAGE_OPTIONS = {
    "echo": True,
    "header": "seed = 4",
    "pyproject": 'dependencies = ["polars"]',
}


def page_root(source: str = "value = 1") -> Element:
    root = Element("marimo")
    markdown = Element(MARIMO_MD)
    markdown.text = "# Heading"
    root.append(markdown)
    cell = Element("marimo-code", attrib={"language": "python"})
    cell.text = source
    root.append(cell)
    return root


def test_collect_page_excludes_document_markdown():
    page = collect_page(
        page_root(),
        filename="/tmp/page.qmd",
        global_eval=True,
        page_options=PAGE_OPTIONS,
    )

    assert len(page.cells) == 1
    assert page.cells[0].source == "value = 1"
    assert page.filename == "page.qmd"
    assert page.metadata.pyproject == 'dependencies = ["polars"]'
    assert page.metadata.setup_cells[0].source == "seed = 4"
    assert page.defaults == {"render": {"source": True}}


def test_page_identity_tracks_authored_content():
    first = collect_page(
        page_root("value = 1"),
        filename="page.qmd",
        global_eval=True,
        page_options=PAGE_OPTIONS,
    )
    same = collect_page(
        page_root("value = 1"),
        filename="other.qmd",
        global_eval=True,
        page_options=PAGE_OPTIONS,
    )
    changed = collect_page(
        page_root("value = 2"),
        filename="page.qmd",
        global_eval=True,
        page_options=PAGE_OPTIONS,
    )

    assert first.identity == same.identity
    assert first.identity != changed.identity


def test_global_eval_disables_each_cell():
    page = collect_page(
        page_root("#| eval: true\nvalue = 1"),
        filename="page.qmd",
        global_eval=False,
        page_options=PAGE_OPTIONS,
    )

    assert page.defaults == {
        "render": {"source": True},
        "execution": {"enabled": False},
    }
    assert page.cells[0].options == {"language": "python"}


def test_header_booleans_become_page_defaults():
    page = collect_page(
        page_root(),
        filename="page.qmd",
        global_eval=True,
        page_options={"error": False, "output": True},
    )

    assert page.defaults == {"render": {"error": False, "output": True}}
