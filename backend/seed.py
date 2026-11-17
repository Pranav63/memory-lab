PAPERS = [
    ('Retrieval-Augmented Generation', 'https://arxiv.org/abs/2005.11401',
     'Paper brief · Lewis et al., 2020. RAG combines a language generator with a searchable external collection. Its retriever supplies passages to generation, allowing source evidence to complement knowledge stored in model parameters. This brief is an original reading aid, not the complete paper.'),
    ('LoCoMo: evaluating long-term memory', 'https://arxiv.org/abs/2402.17753',
     'Paper brief · Maharana et al., 2024. LoCoMo evaluates agents over extended conversations. The tasks include answering questions about earlier events and summarizing events. Temporal reasoning and remembering information across sessions remain difficult. This brief is an original reading aid, not the complete paper.'),
    ('Mem0: scalable long-term memory', 'https://arxiv.org/abs/2504.19413',
     'Paper brief · Chhikara et al., 2025. Mem0 studies extracting, consolidating and retrieving important information from conversations instead of repeatedly passing complete histories. It compares memory methods with retrieval and full-context baselines. Results depend on the evaluation setup. This brief is an original reading aid, not the complete paper.'),
    ('Zep: temporal knowledge graphs', 'https://arxiv.org/abs/2501.13956',
     'Paper brief · Rasmussen et al., 2025. Zep uses Graphiti to represent information as entities and relationships that evolve over time. Temporal records preserve changing facts and their origins. The approach targets context assembly for agents working with continuing conversations and business data. This brief is an original reading aid, not the complete paper.'),
]


def seed(store):
    if store.sources():
        return
    for title, url, text in PAPERS:
        store.add_source(title, 'brief', url, text)
    store.add_source('Starter research notebook', 'note', '',
                     'Illustrative project note. For the first Memory Lab experiment, compare no workspace context, document retrieval, and document retrieval with saved findings. Keep the generator and question fixed. Report retrieval separately from answer correctness. Do not claim one memory system is best from one question.')
