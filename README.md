# mcp-futuur

Futuur Prediction Market MCP.

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1394+ live data sources.

## Tools

| Tool | Description |
|------|-------------|
| `search_markets` | Search Futuur prediction markets (politics, crypto, sports, science) by text. Returns open markets by default with per-outcome implied probabilities in both play-money (OOM) and real-money (USDC) modes. Keyless. |
| `get_market` | Get one Futuur market by id with its full outcome list and per-outcome implied probabilities (play-money OOM + real-money USDC, as percentages), volumes, tags, description, and resolution status. Example id: 231754 ("Which price will Bitcoin hit in 2026?"). Keyless. |
| `top_markets` | Most-active open Futuur markets (attention signal), ranked by trading volume. Returns each market with per-outcome implied probabilities (OOM play-money + USDC real-money). Keyless. |

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "futuur": {
      "url": "https://gateway.pipeworx.io/futuur/mcp"
    }
  }
}
```

Or connect to the full Pipeworx gateway for access to all 1394+ data sources:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English:

```
ask_pipeworx({ question: "your question about Futuur data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
