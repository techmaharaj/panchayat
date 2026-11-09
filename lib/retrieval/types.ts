export interface Speaker {
  name: string;
  job_title?: string;
  affiliation?: string;
  bio?: string;
}

export interface Talk {
  id: string;
  title: string;
  abstract: string;
  track?: string;
  session_types?: string[];
  speakers?: Speaker[];
  conference: string;
  edition: string;
  year: number;
  source_url: string;
  accepted?: boolean;
}

export interface Neighbour {
  id: string;
  title: string;
  conference: string;
  edition: string;
  year: number;
  track?: string;
  source_url: string;
  similarity: number;
  speakers?: Speaker[];
  abstract?: string;
}

export interface TopicCount {
  total: number;
  byYear: Record<string, number>;
  examples: Neighbour[];
}

export interface TalkSearch {
  readonly backend: string;
  searchSimilar(
    text: string,
    o?: { k?: number; excludeId?: string },
  ): Promise<Neighbour[]>;
  countTopic(topic: string): Promise<TopicCount>;
}
