# Fomoxa Protocol

**English** · [Tiếng Việt](vi/README.md)

Fomoxa is a way of specifying **how data is written as bytes**.

That's all it is.

---

## The 30-second explanation

You have a `Player`:

```
Hp   = 100
Name = "Alice"
```

Fomoxa specifies that it becomes exactly this byte sequence:

```
64 00 00 00   05 00 00 00   41 6C 69 63 65
   Hp = 100    Length = 5      A  l  i  c  e
```

13 bytes. No field names, no braces, no tags - just data.

The key point: **Go, C#, Rust and C must all produce these exact 13 bytes.** Not "equivalent" - identical, byte for byte.

---

## Why that matters

With JSON or Protobuf, the same data can produce different bytes depending on the language, the library, the version. Usually that's fine. It breaks completely when:

- You **sign or hash** a payload - a signature covers bytes; if the bytes change the signature fails even though the data didn't.
- You run **replay or lockstep** - two machines must reach the same result from the same input sequence.
- You want to **prove two SDKs are compatible** - the only way is to compare bytes.

Fomoxa solves this by removing every choice: wherever an encoder is allowed to choose, two encoders will eventually choose differently.

---

## What Fomoxa is not

```
✗ Networking framework    ✗ RPC
✗ Game engine             ✗ Transport (TCP/UDP/QUIC)
✗ Encryption              ✗ Compression
```

Those are built **on top of** Fomoxa. Fomoxa stands exactly where data changes shape:

```
Model  →  Bytes
Bytes  →  Model
```

---

## How it works

Four rules are enough to understand the whole thing:

**1. Numbers are fixed-size, little-endian.** `UInt32` is always 4 bytes, even for the value 0. No varints.

**2. Strings and arrays are length-prefixed.** `[4-byte length][data]`. For strings, the length is the **number of UTF-8 bytes**, not characters.

**3. A Model is its fields, concatenated.** No header, no padding, no delimiter. The decoder knows which field it is reading **from the cursor position**, not from a tag.

**4. No metadata.** The byte stream is not self-describing. The receiver **must** already know the exact order and type of every field.

The consequences of rules 3 and 4, worth understanding before you adopt this:

```
Rename a field    →  no byte changes           (safe)
Reorder fields    →  the whole stream changes  (breaking change)
Wrong definition  →  usually NO error, just silently wrong data
```

---

## Fomoxa does not mandate an IDL

The source of truth is the **Schema** - the type names, field names, Fomoxa types, and field order. The bytes come from the Schema, and from nothing else.

But Fomoxa does not dictate how you **write** that Schema down:

```
Many ways of expressing it   →   one Schema   →   exactly one byte sequence
```

No mandatory `.fomoxa` file. No mandatory IDL compiler. As long as both ends derive the same Schema, the bytes match.

The Reference Implementation expresses it with annotations on your existing model - in C#, for example:

```csharp
[Network]
public partial class Player
{
    [Network(UInt32)]
    public uint Hp;

    [Network(PlayerInfo)]
    public PlayerInfo Info;
}
```

It does not need to understand `public`, `partial`, `class`, `uint`, or whether `PlayerInfo` is a class or a struct. It only has to extract three things to build the Schema:

```
Type Name    →  Player
Field Name   →  Hp
Fomoxa Type →  UInt32
```

The Fomoxa type comes from the annotation; it is never inferred from the language's own type. Writing `[Network(UInt32)]` on an incompatible field is a declaration error and is reported as one - Fomoxa does not guess on your behalf.

The consequence: adding a new language is very light. A frontend only needs to read the annotation, the type name and the field name - no semantic analysis, no understanding of that language's type system.

Another implementation is free to choose a different route entirely - a separate schema file, macros, or a hand-written codec. There is only one standard to judge it by: are the bytes right.

---

## When NOT to use it

Stated up front:

- You need old clients to talk to new servers → **Fomoxa is a poor fit**. v1 has no schema evolution.
- Your schema changes constantly → every change requires deploying both sides together.
- You need to read the data by eye → Fomoxa is pure binary.
- You have many "may not be present" fields → v1 has no Optional/Nullable.

If any of these describe you, Protobuf is the better choice.

---

## What Fomoxa guarantees

```
Same schema, same values

↓

Every implementation MUST produce identical bytes.
```

If they don't, that is an **implementation bug**, not a protocol one. And that bug is caught by a single byte-array comparison - see the Conformance document.

---

## Documents

Read in this order:

| Document | Answers |
|----------|---------|
| [RFC-0001 - What Fomoxa is](en/RFC-0001.md) | What problem it solves, why choose it, when **not** to |
| [RFC-0002 - Wire Format](en/RFC-0002.md) | What shape the bytes must have |
| [RFC-0003 - Conformance](en/RFC-0003.md) | How do I know my implementation is correct (test vectors) |

Vietnamese source of record: [`vi/RFC-0001.md`](vi/RFC-0001.md) · [`vi/RFC-0002.md`](vi/RFC-0002.md) · [`vi/RFC-0003.md`](vi/RFC-0003.md)

Landing page: [fomoxa-protocol.github.io/fomoxa](https://fomoxa-protocol.github.io/fomoxa/) - source in [`index.html`](index.html) (English) and [`vi/index.html`](vi/index.html) (Vietnamese)

---

## Contributing

Fomoxa is a **specification**, not a library. Implementations are needed for Rust, Go, C#/Unity, C/embedded, Zig/C++.

The single criterion for being called **Fomoxa Compatible**:

```
Run the test vectors in RFC-0003

↓

Pass 100%
```

There is no 98%. One failing vector means there exists data on which your implementation and another disagree.

See the [ecosystem status table](https://fomoxa-protocol.github.io/fomoxa/#implementations) for which languages are still open.

### Translations

Vietnamese is the source of record; English is a translation. The workflow is described in [`TRANSLATION.md`](TRANSLATION.md).

---

## Repository layout

```
.
├── README.md            this document (English)
├── TRANSLATION.md       how the two language versions stay in sync
├── index.html           landing page, English (GitHub Pages)
├── LICENSE              CC BY 4.0
│
├── vi/                  Vietnamese - source of record
│   ├── README.md
│   ├── index.html
│   ├── RFC-0001.md      What Fomoxa is
│   ├── RFC-0002.md      Wire Format Specification
│   └── RFC-0003.md      Conformance
│
└── en/                  English - translation
    ├── RFC-0001.md
    ├── RFC-0002.md
    └── RFC-0003.md
```

## License

This entire repository is under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) - see [`LICENSE`](LICENSE).

You are free to copy, translate, quote and create derivative works from the specification, including commercially, as long as you **give attribution**.

This is a **specification, not software**. Your implementation is a separate work, not a derivative of the specification - you are free to license it however you like.

## Copyright

Copyright © 2026 Ha Duy Thang
