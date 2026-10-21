import { escapeLikePattern } from "./http";

/** Small, local synonym map for concept searches in Spanish and English. */
const SEARCH_SYNONYM_GROUPS = [
  ["perro", "perros", "perrito", "perritos", "canino", "canina", "caninos", "mascota", "mascotas", "dog", "dogs", "puppy", "puppies"],
  ["gato", "gatos", "gatito", "gatitos", "felino", "felinos", "mascota", "mascotas", "cat", "cats", "kitten", "kittens"],
  ["ovni", "ovnis", "ufo", "ufos", "extraterrestre", "extraterrestres", "alien", "aliens", "alienigena", "alienigenas", "marciano", "marcianos", "platillo volador", "platillos voladores"],
  ["zombie", "zombies", "zombi", "zombis", "muerto viviente", "muertos vivientes", "undead"],
  ["vampiro", "vampiros", "vampire", "vampires"],
  ["bruja", "brujas", "brujo", "brujos", "witch", "witches"],
] as const;

export interface CatalogueSearchFields {
  title: string;
  synopsis: string;
  metadata?: string[];
}

export interface CatalogueSearchSql {
  condition: string;
  params: string[];
  relevanceOrder: string;
}

function normalizeTerm(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Expands a short query into useful exact words and curated concept synonyms. */
export function expandCatalogueSearchTerms(query: string): string[] {
  const original = query.trim();
  const normalized = normalizeTerm(original);
  const terms = new Set<string>([original]);

  for (const word of normalized.split(" ").filter(Boolean)) terms.add(word);
  for (const group of SEARCH_SYNONYM_GROUPS) {
    if (group.some((term) => normalizeTerm(term) === normalized || normalized.split(" ").includes(normalizeTerm(term)))) {
      group.forEach((term) => terms.add(term));
    }
  }

  return [...terms].slice(0, 16);
}

/**
 * Builds a parameterized, weighted search across a media record. The caller
 * provides only fixed SQL column expressions; user input is always a value.
 */
export function buildCatalogueSearch(
  query: string,
  fields: CatalogueSearchFields,
  firstParameter = 1,
): CatalogueSearchSql {
  const escapedQuery = escapeLikePattern(query.trim());
  const terms = expandCatalogueSearchTerms(query).map((term) => `%${escapeLikePattern(term)}%`);
  const allParams = [query.trim(), `${escapedQuery}%`, `%${escapedQuery}%`, ...terms];
  const shortQuery = normalizeTerm(query).length < 3;
  const params = shortQuery ? allParams.slice(0, 3) : allParams;
  const placeholder = (offset: number) => `$${firstParameter + offset}`;
  const containsPlaceholders = terms.map((_, index) => placeholder(index + 3));
  const searchableFields = [fields.title, fields.synopsis, ...(fields.metadata ?? [])];

  // Two-character prefixes only scan titles. Once the query is meaningful,
  // the trigram indexes can help PostgreSQL search synopsis and metadata too.
  const predicates = shortQuery
    ? [
        `${fields.title} ILIKE ${placeholder(0)} ESCAPE '\\'`,
        `${fields.title} ILIKE ${placeholder(1)} ESCAPE '\\'`,
        `${fields.title} ILIKE ${placeholder(2)} ESCAPE '\\'`,
      ]
    : searchableFields.flatMap((field) =>
        containsPlaceholders.map((value) => `${field} ILIKE ${value} ESCAPE '\\'`),
      );

  const relevanceOrder = `CASE
    WHEN lower(${fields.title}) = lower(${placeholder(0)}) THEN 0
    WHEN ${fields.title} ILIKE ${placeholder(1)} ESCAPE '\\' THEN 1
    WHEN ${fields.title} ILIKE ${placeholder(2)} ESCAPE '\\' THEN 2
    WHEN ${fields.synopsis} ILIKE ${placeholder(2)} ESCAPE '\\' THEN 3
    ELSE 4
  END`;

  return { condition: `(${predicates.join(" OR ")})`, params, relevanceOrder };
}
