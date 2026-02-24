    {
      "id": "kilo/auto",
      "name": "Kilo: Auto",
      "created": 0,
      "description": "Automatically routes your request to the best model for the task.",
      "architecture": {
        "input_modalities": [
          "text",
          "image"
        ],
        "output_modalities": [
          "text"
        ],
        "tokenizer": "Other"
      },
      "top_provider": {
        "is_moderated": false,
        "context_length": 1000000,
        "max_completion_tokens": 64000
      },
      "pricing": {
        "prompt": "0.0000010",
        "completion": "0.0000010",
        "request": "0",
        "image": "0",
        "web_search": "0",
        "internal_reasoning": "0"
      },
      "context_length": 1000000,
      "supported_parameters": [
        "max_tokens",
        "temperature",
        "tools",
        "reasoning",
        "include_reasoning"
      ],
      "preferredIndex": -1
    },