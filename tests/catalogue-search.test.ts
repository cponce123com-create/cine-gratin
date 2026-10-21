import { describe, expect, it } from "vitest";
import { buildCatalogueSearch, expandCatalogueSearchTerms } from "../backend/src/lib/catalogue-search";

describe("catalogue concept search", () => {
  it("expands Spanish dog searches into related terms", () => {
    const terms = expandCatalogueSearchTerms("perro");

    expect(terms).toContain("perros");
    expect(terms).toContain("dog");
    expect(terms).toContain("puppy");
  });

  it("normalizes accents and expands UFO searches", () => {
    const terms = expandCatalogueSearchTerms("OVNÍS");

    expect(terms).toContain("ufos");
    expect(terms).toContain("extraterrestres");
    expect(terms).toContain("platillo volador");
  });

  it("builds parameterized search across plot and metadata with title relevance", () => {
    const search = buildCatalogueSearch("ovni", {
      title: "title",
      synopsis: "synopsis",
      metadata: ["genres_text", "cast_text"],
    });

    expect(search.params[0]).toBe("ovni");
    expect(search.condition).toContain("title ILIKE $4");
    expect(search.condition).toContain("synopsis ILIKE $4");
    expect(search.condition).toContain("genres_text ILIKE $4");
    expect(search.condition).toContain("cast_text ILIKE $4");
    expect(search.relevanceOrder).toContain("CASE");
  });

  it("searches catalogue keywords and the complete cast as metadata", () => {
    const search = buildCatalogueSearch("Brad Pitt", {
      title: "title",
      synopsis: "synopsis",
      metadata: [
        "COALESCE(array_to_string(keywords, ' '), '')",
        "COALESCE(cast_full::text, '')",
      ],
    });

    expect(search.condition).toContain("array_to_string(keywords, ' ')");
    expect(search.condition).toContain("cast_full::text ILIKE");
    expect(search.condition).toContain("synopsis ILIKE");
  });

  it("uses the initial parameters in the filter so count queries can bind them", () => {
    const search = buildCatalogueSearch("perro", { title: "title", synopsis: "synopsis" });

    expect(search.condition).toContain("title ILIKE $1");
    expect(search.condition).toContain("title ILIKE $2");
    expect(search.condition).toContain("title ILIKE $3");
  });

  it("uses caller-provided parameter offsets and keeps short searches bounded", () => {
    const search = buildCatalogueSearch("ab", { title: "title", synopsis: "synopsis" }, 4);

    expect(search.params).toHaveLength(3);
    expect(search.condition).toContain("title ILIKE $4");
    expect(search.condition).toContain("title ILIKE $6");
    expect(search.condition).not.toContain("synopsis ILIKE");
    expect(search.relevanceOrder).toContain("$4");
  });
});
