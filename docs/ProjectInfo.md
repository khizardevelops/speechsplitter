# LangChunk Project Information

## One-Line Summary

LangChunk is an offline-first multilingual parser that accepts natural language text in any language and breaks it into meaningful grammatical units: words, phrases, clauses, and sentences.

## Core Idea

Users should be able to paste a famous speech, a dialogue, a story, a letter, a song excerpt, a classroom text, or any other natural-language passage, then see the text separated into useful layers of grammar.

The tool is not just a basic text splitter. It should understand that language has several nested levels:

1. A sentence contains clauses.
2. A clause contains phrases.
3. A phrase contains words.
4. A word may be a single written token or a multi-word concept that functions as one unit.

The goal is to make grammar visible and reusable. A language learner, teacher, researcher, or application can take real text and turn it into structured material for study, review, annotation, flashcards, examples, and analysis.

## Main Output Levels

### 1. Word

A word is the smallest independent unit of language that carries meaning and can stand on its own in conversation.

In LangChunk, a word should not be treated only as "characters between spaces." Some words are written as one piece, some are written with hyphens, and some are written as multiple terms that together represent one idea.

Examples:

- `run`
- `students`
- `high school`
- `post office`
- `ice cream`
- `mother-in-law`
- `self-esteem`
- `smartphone`
- `check-in`

The important idea is that LangChunk should identify meaningful lexical units, not merely split on whitespace.

### Word-Like Units And Compounds

#### Open Compounds

Open compounds are written with spaces but act as one concept.

Examples:

- `ice cream`
- `social media`
- `real estate`
- `hot dog`
- `living room`
- `high school`

Separating the parts often changes the meaning. `Hot dog` is not just a warm dog. `Real estate` is not simply an actual estate.

#### Hyphenated Compounds

Hyphenated compounds use hyphens to bind multiple words into one unit.

Examples:

- `mother-in-law`
- `up-to-date`
- `merry-go-round`
- `self-esteem`
- `know-it-all`

These should be treated as single lexical units unless a language-specific rule says otherwise.

#### Closed Compounds

Closed compounds are written as one fused word.

Examples:

- `smartphone`
- `keyboard`
- `notebook`
- `sunflower`
- `firefighter`

#### Idiomatic Single Units

Some expressions function as one unit because usage has given them a fixed meaning.

Examples:

- `check-in`
- `breakup`

#### Dictionary Rule

If a multi-part expression has its own established meaning as a single entry, LangChunk should be able to treat it as one lexical unit. This matters especially for language learning, where users need to learn real usage rather than mechanical word boundaries.

### 2. Phrase

A phrase is a group of two or more words that functions as one unit inside a sentence.

A phrase does not contain both a subject and a predicate working together. It is not a complete thought.

Examples:

- `After high school`
- `The energetic high school students`
- `in the green box`
- `with fresh vegetables`
- `about our lives`

LangChunk should identify phrase types when possible, such as noun phrases, verb phrases, prepositional phrases, adjective phrases, and adverbial phrases.

### 3. Clause

A clause is a group of words that contains both:

- a subject: the person, thing, or idea being discussed
- a predicate: the action, state, or description attached to the subject

There are two main clause types:

#### Independent Clause

An independent clause can stand alone as a complete thought.

Example:

- `they passed the exam`

#### Dependent Clause

A dependent clause has a subject and predicate, but it starts with a connector or structure that leaves the thought unfinished.

Example:

- `Because the high school students studied hard`

This has a subject and action, but the listener still expects the rest of the sentence.

LangChunk should identify both independent and dependent clauses, including coordinated clauses joined by words like `and`, `but`, and equivalents in other languages.

### 4. Sentence

A sentence is the largest independent grammatical unit.

A sentence should:

- express a complete thought
- contain at least one independent clause
- usually end with sentence punctuation or an equivalent boundary marker

Examples:

- `They studied.`
- `Because the high school students studied hard, they passed the exam.`

Sentences may be short, long, literary, conversational, formal, or fragmented. LangChunk should handle real-world text, not only clean textbook examples.

## Desired User Experience

The user should be able to enter text and receive a clear display like:

- Sentences
- Clauses
- Words

A detailed mode may additionally show:

- phrases
- phrase types
- clause types
- language-specific notes
- uncertainty or confidence indicators

A simplified mode should be easy to read and useful for language learners.

Punctuation should usually be excluded from the word list unless the user asks for token-level detail. The word list should show unique meaningful units where appropriate.

## Reference Behavior

For Russian, a long passage should be separated into numbered sentences, then into meaningful clauses, then into a unique word list with punctuation excluded.

For Pashto, text should be separated into sentences, clauses joined by connectors such as `او`, and a clean word list with punctuation excluded.

For English, text should be separated into sentences, clauses such as:

- `I go to the market every day`
- `and buy fresh vegetables`
- `where my children play`
- `When the weather is nice`
- `we sit outside`
- `and watch the birds`
- `while talking about our lives`
- `that her daughter is getting married next month`

The examples in `test data/` represent the kind of output quality the project should move toward.

## Product Goals

### 1. Offline-First

All processing should happen locally. Users should not need to send private text to an external service.

This is important because input may include:

- personal writing
- classroom material
- copyrighted study passages
- religious text
- political speeches
- private conversations
- language-learning notes

### 2. Multilingual

LangChunk should support broad multilingual parsing.

Long-term target:

- 100+ languages with broad automated support
- 11+ languages with dedicated language-specific rules
- graceful fallback for languages that do not yet have dedicated support

The tool should work across different writing systems and punctuation conventions.

Important target languages include English, Russian, and Pashto, but the project should not be limited to them.

### 3. Highly Accurate

Accuracy matters more than flashy output.

The parser should avoid:

- splitting sentences incorrectly
- merging separate sentences
- missing obvious clauses
- treating punctuation as words in simplified output
- losing connector words at clause boundaries
- confusing phrases with clauses
- ignoring multi-word lexical units

The tool should be judged against real passages, not only artificial examples.

### 4. Lightweight

The tool should feel fast and practical.

It should avoid unnecessary bulk, avoid wasting memory, and stay usable on ordinary machines.

The user should be able to paste a passage and get results quickly.

### 5. Extensible

LangChunk should be easy to extend for new languages.

A future contributor should be able to add:

- sentence boundary behavior
- word and compound recognition
- phrase rules
- clause rules
- language-specific connector words
- language-specific punctuation handling
- language-specific examples and quality tests

The system should make it clear where language-specific knowledge belongs.

## Example Use Cases

### Language Learning

A learner pastes a favorite speech, dialogue, story, or article. LangChunk breaks it into sentences, clauses, and words. A learning app can then help the user study real examples from material they care about.

Possible learning workflows:

- generate flashcards from real sentences
- extract useful clauses as sentence-building examples
- identify repeated words and phrases
- study connector words in context
- compare sentence structure across languages
- build reading exercises from authentic text

### Teaching

A teacher can paste a passage and quickly get:

- sentence breakdown
- clause breakdown
- phrase examples
- vocabulary list

This can help prepare grammar lessons or reading exercises.

### Linguistic Analysis

A researcher or language enthusiast can inspect how a text is structured and compare parsing quality across languages.

### Writing And Editing

A writer can inspect long sentences, identify complex clauses, and understand where a sentence may be too dense.

## What LangChunk Is Not

LangChunk is not primarily:

- a translator
- a dictionary
- a grammar correction tool
- a chatbot
- a summarizer
- a full explanation engine

It may support those tools later, but its core job is parsing text into meaningful grammatical units.

## Expected Output Principles

### Preserve The Original Text

The parser should not rewrite the user's text. It may normalize internally, but displayed results should remain faithful to the original.

### Keep Boundaries Traceable

Every sentence, clause, phrase, and word should be traceable back to the original text.

### Separate Display From Analysis

The same parsed result should support multiple views:

- simplified learner-friendly display
- detailed grammar display
- structured export for other tools

### Be Honest About Uncertainty

Some languages and passages are hard. If the parser is uncertain, it should be able to expose that uncertainty rather than pretending every split is perfect.

### Prefer Useful Output Over Perfect Theory

The goal is practical parsing for real users. Linguistic theory should guide the tool, but the output must remain understandable and useful.

## Multilingual Challenges To Plan For

Different languages vary in ways that affect parsing:

- punctuation conventions
- word spacing
- compounds
- clitics and particles
- flexible word order
- omitted subjects
- verb placement
- agreement markers
- case marking
- connector words
- sentence fragments
- quotation style
- abbreviations
- mixed-language text

LangChunk should be designed with these differences in mind.

## Quality Evaluation

The project should be evaluated with real passages in multiple languages.

For each language, evaluation should check:

- sentence boundaries
- clause boundaries
- word list quality
- punctuation handling
- multi-word unit handling
- connector handling
- long sentence behavior
- literary or informal text behavior

The examples in `test data/` should become part of a growing reference set.

## Suggested Development Roadmap

### Phase 1: Define The Standard Output

Define exactly what LangChunk should return for:

- sentence
- clause
- phrase
- word
- simplified display
- detailed display

This phase should settle the meaning of each unit before build choices are debated.

### Phase 2: Build A Reference Dataset

Collect representative texts and expected outputs for English, Russian, Pashto, and other priority languages.

Each example should include:

- original text
- expected sentences
- expected clauses
- expected words
- notes for ambiguous cases

### Phase 3: Improve The Core Parser

Improve sentence, clause, phrase, and word recognition until it performs well on the reference examples.

Focus first on:

- punctuation handling
- connector words
- compound words
- dependent clauses
- coordinated clauses
- unique word display

### Phase 4: Add Multilingual Depth

Expand dedicated language behavior for more languages.

Each dedicated language should have:

- sentence boundary rules
- common connector words
- phrase patterns
- clause patterns
- word and compound handling
- evaluation examples

### Phase 5: Add Broad Multilingual Coverage

Add broad support for many languages while keeping local processing and practical performance.

The broad path should help with languages that do not yet have dedicated rules, while dedicated language support should remain available for higher quality.

### Phase 6: Product Workflows

Build workflows around the parser:

- study mode
- flashcard generation
- classroom exports
- text comparison
- saved parsing sessions
- user corrections to improve future parsing

## Success Criteria

LangChunk is successful if a user can paste a real text and quickly understand:

- where the sentences are
- what the clauses are
- what the key phrases are
- what the meaningful words are
- how the text is grammatically built

For language learners, success means they can turn meaningful texts they care about into useful study material.

For future contributors, success means the project has clear definitions, clear expected output, and a clear path for adding better language support.

## Guidance For Future Planning

When discussing future build choices, start from this document.

Do not begin by choosing tools. First confirm:

1. The exact output format users need.
2. The target languages for the next milestone.
3. The expected quality level for each language.
4. The acceptable size and speed tradeoffs.
5. How users will correct or review bad parses.
6. How language-specific behavior will be added over time.

Only after those questions are clear should an agent recommend the standard tools and approaches to build the system.
