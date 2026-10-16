from dotenv import load_dotenv
from backend.schemas import ExtractResponse
from openai import AsyncOpenAI
from pathlib import Path
import logging
import time
import os


system_instruction = """Extract the requested information from the provided job posting.

STRICT EXTRACTION RULES:
1. Only return information that is explicitly stated in the input text.
2. Never invent, guess, assume, or infer information that is not explicitly provided.
3. If a field cannot be reliably determined from the input, return null or an empty list according to the provided schema.
4. Do not use general knowledge, prior knowledge, assumptions, or typical industry practices to fill missing information.
5. Preserve extracted information accurately. Do not alter, estimate, calculate, or reinterpret values unless explicitly required by the schema.
6. For salary, preserve the stated amount, currency, range, and pay period exactly as provided. Do not convert currencies or calculate annual/monthly equivalents.
7. For company, return only the company or organization name explicitly associated with the job posting.
8. For role, return only the job title explicitly stated in the posting.
9. For requirements, include only qualifications, skills, education, experience, certifications, or other requirements explicitly stated in the posting. Do not treat responsibilities, benefits, or preferred assumptions as requirements unless the posting explicitly presents them as such.
10. For links, return only URLs explicitly present in the input. Never construct, modify, or guess a URL.
11. If the input contains conflicting information, do not resolve the conflict by guessing. Extract the information as stated or return null when the correct value cannot be determined.
12. Do not output information simply because it is likely or typical for the position.
13. Accuracy is more important than completeness. It is better to return null or an empty list than to provide information that is not supported by the input.

Return the information using the provided schema."""

load_dotenv(Path(__file__).resolve().parent / ".env")
client = AsyncOpenAI(
    base_url="https://integrate.api.nvidia.com/v1",
    api_key=os.environ["NVIDIA_API_KEY"],
    timeout=20,
    max_retries=0
)
logger = logging.getLogger(__name__)

async def extract(text: str) -> ExtractResponse:
    start = time.perf_counter()
    resp = await client.chat.completions.create(
        model="openai/gpt-oss-20b",
        messages=[
            {
                "role": "system",
                "content": system_instruction
            },
            {
                "role": "user",
                "content": text
            }
        ],
        temperature=0,
        max_completion_tokens=4000,
        response_format={
            "type": "json_schema",
            "json_schema": {"name": "ExtractResponse", "schema": ExtractResponse.model_json_schema()}
        }
    )
    elapsed = time.perf_counter() - start

    raw = resp.choices[0].message.content

    finish_reason = resp.choices[0].finish_reason if resp.choices else None

    tokens = {
        "prompt_tokens": resp.usage.prompt_tokens or 0,
        "output_tokens": resp.usage.completion_tokens or 0
    }

    logger.info("input_len=%d time_taken=%.2f stopped_reason=%s tokens_in=%d tokens_out=%d", len(text), elapsed, finish_reason, tokens['prompt_tokens'], tokens['output_tokens'])

    return ExtractResponse.model_validate_json(raw)