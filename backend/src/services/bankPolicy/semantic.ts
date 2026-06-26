/**
 * 2026 Bank Lending Policy Engine — local semantic index (feature D, experimental).
 *
 * A dependency-free, DETERMINISTIC stand-in for an embedding model: a TF-IDF
 * vector-space index with cosine similarity over the generated bank policy
 * summaries. It lets us demonstrate "semantic retrieval over the policy
 * documents" — shortlist the banks whose policy text best matches a free-text
 * description of the client scenario — without any external API call.
 *
 * Why local + lexical instead of a hosted embedding model?
 *   - Reproducible: same inputs always give the same scores (important for a
 *     lending tool that must be auditable).
 *   - Zero-dependency and offline.
 *   - Swappable: `buildQueryText` + the index interface are the only contract,
 *     so a real embedding backend can replace `vectorise` later.
 *
 * This is a RETRIEVAL/shortlisting aid only — it never sets borrowing numbers.
 */

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'is', 'are',
  'be', 'this', 'that', 'it', 'as', 'at', 'by', 'from', 'up', 'per', 'not', 'no',
  'than', 'their', 'its', 'into', 'only', 'each', 'they', 'will', 'has', 'have',
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9%+\s.-]/g, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/^[.-]+|[.-]+$/g, ''))
    .filter((t) => t.length > 1 && !STOPWORDS.has(t) && !/^\d+$/.test(t));
}

type SparseVec = Map<string, number>;

export interface SemanticIndex {
  ids: string[];
  vectors: Map<string, SparseVec>; // id -> normalised tf-idf vector
  idf: Map<string, number>;
}

function termFreq(tokens: string[]): SparseVec {
  const tf: SparseVec = new Map();
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
  return tf;
}

function l2normalise(v: SparseVec): SparseVec {
  let sum = 0;
  for (const x of v.values()) sum += x * x;
  const norm = Math.sqrt(sum) || 1;
  const out: SparseVec = new Map();
  for (const [k, x] of v) out.set(k, x / norm);
  return out;
}

/** Build a TF-IDF index from a set of { id, text } documents. */
export function buildIndex(docs: Array<{ id: string; text: string }>): SemanticIndex {
  const tfs = docs.map((d) => ({ id: d.id, tf: termFreq(tokenize(d.text)) }));
  const df = new Map<string, number>();
  for (const { tf } of tfs) for (const term of tf.keys()) df.set(term, (df.get(term) ?? 0) + 1);

  const N = docs.length || 1;
  const idf = new Map<string, number>();
  for (const [term, d] of df) idf.set(term, Math.log((N + 1) / (d + 1)) + 1);

  const vectors = new Map<string, SparseVec>();
  for (const { id, tf } of tfs) {
    const v: SparseVec = new Map();
    for (const [term, count] of tf) v.set(term, count * (idf.get(term) ?? 0));
    vectors.set(id, l2normalise(v));
  }
  return { ids: docs.map((d) => d.id), vectors, idf };
}

/** Vectorise a free-text query against an existing index's idf weights. */
export function vectorise(text: string, index: SemanticIndex): SparseVec {
  const tf = termFreq(tokenize(text));
  const v: SparseVec = new Map();
  for (const [term, count] of tf) {
    const idf = index.idf.get(term);
    if (idf) v.set(term, count * idf);
  }
  return l2normalise(v);
}

function cosine(a: SparseVec, b: SparseVec): number {
  // Iterate the smaller vector for efficiency; both are L2-normalised.
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [k, x] of small) {
    const y = large.get(k);
    if (y) dot += x * y;
  }
  return dot;
}

export interface SemanticHit {
  id: string;
  similarity: number;
}

/** Rank indexed documents by cosine similarity to the query text. */
export function search(queryText: string, index: SemanticIndex): SemanticHit[] {
  const q = vectorise(queryText, index);
  return index.ids
    .map((id) => ({ id, similarity: Number(cosine(q, index.vectors.get(id)!).toFixed(4)) }))
    .sort((a, b) => b.similarity - a.similarity);
}
