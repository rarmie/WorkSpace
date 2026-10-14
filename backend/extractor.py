from google import genai
from google.genai import types
from dotenv import load_dotenv
from backend.schemas import ExtractResponse
from pathlib import Path
import logging
import time

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
client = genai.Client(
    http_options=types.HttpOptions(
        timeout=20_000,
        retry_options=types.HttpRetryOptions(attempts=1)
    )
)
logger = logging.getLogger(__name__)

async def extract(text: str) -> ExtractResponse:
    start = time.perf_counter()
    resp = await client.aio.models.generate_content(
        model='gemini-3.5-flash',
        contents=text,
        config=types.GenerateContentConfig(
            system_instruction=system_instruction,
            temperature=0,
            response_mime_type="application/json",
            response_schema=ExtractResponse,
            thinking_config=types.ThinkingConfig(thinking_budget=0),
            seed=42,
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True)
        )
    )
    finish_reason = resp.candidates[0].finish_reason if resp.candidates else None

    usage = resp.usage_metadata
    tokens = {
        "prompt_tokens": usage.prompt_token_count or 0,
        "output_tokens": usage.candidates_token_count or 0,
        "thoughts_tokens": usage.thoughts_token_count or 0
    }

    elapsed = time.perf_counter() - start
    logger.info("input_len=%d time_taken=%.2f stopped_reason=%s tokens_in=%d tokens_out=%d think_tokens=%d", len(text), elapsed, finish_reason, tokens['prompt_tokens'], tokens['output_tokens'], tokens['thoughts_tokens'])

    return ExtractResponse.model_validate_json(resp.text)