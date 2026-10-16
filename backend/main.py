from fastapi import FastAPI, HTTPException
from backend.schemas import ExtractRequest, ExtractResponse, HealthResponse, MatchRequest, MatchResponse
from backend.extractor import extract
from backend.fetch_posting import fetch_posting, BlockedURL, Unusable
from backend.matcher import match, score, VerdictMismatch
from pydantic import ValidationError
import logging
import httpx
import openai


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s"
)

logger = logging.getLogger(__name__)

app = FastAPI()

@app.get("/")
def read_root():
    return {"message": "Job Tracker API"}

@app.post("/extract")
async def extract_job(payload: ExtractRequest) -> ExtractResponse:
    if payload.url is not None:
        try:
            payload = await fetch_posting(str(payload.url))
        except BlockedURL as e:
            logger.warning("Web page can't be retrieved safely (400):%s", e)
            raise HTTPException(
                status_code=400,
                detail=str(e)
            ) from e 
        except Unusable as e:
            logger.warning("Content extracted is not usable (422):%s", e)
            raise HTTPException(
                status_code=422,
                detail=f"{str(e)} Paste the text instead."
            ) from e
        except httpx.TimeoutException as e:
            logger.warning("The site took too long to respond (504):%s", e)
            raise HTTPException(
                status_code=504,
                detail="The site took too long to respond."
            ) from e 
        except httpx.HTTPError as e:
            logger.warning("Couldn't reach site (502):%s", e)
            raise HTTPException(
                status_code=502,    
                detail="Couldn't reach site."
            ) from e

    elif payload.text is not None:
        payload = payload.text

    try: 
        return await extract(payload)
    except openai.InternalServerError as e:
        logger.warning("Model is unavailable (503):%s", e)
        raise HTTPException(
            status_code=503,
            detail="Feature is unavailable. Try again."
        ) from e
    except openai.APITimeoutError as e:
        logger.warning("Model took too long (504):%s", e)
        raise HTTPException(
            status_code=504,
            detail="Extracting took too long. Try again later."
        ) from e
    except openai.RateLimitError as e:
        logger.warning("Rate limit reached (429):%s", e)
        raise HTTPException(
            status_code=429,
            detail="Rate limit reached. Try again later."
        ) from e
        
@app.get("/health")
def check_health() -> HealthResponse:
    return HealthResponse(
        status="ok"
    )

@app.post("/match")
async def match_resume(payload: MatchRequest) -> MatchResponse:
    try:
        result = await match(payload)
    except openai.InternalServerError as e:
        logger.warning("Model is unavailable (503):%s", e)
        raise HTTPException(
            status_code=503,
            detail="Feature is unavailable. Try again later."
        ) from e
    except openai.APITimeoutError as e:
        logger.warning("Model took too long (504):%s", e)
        raise HTTPException(
            status_code=504,
            detail="Matching took too long. Try again later."
        ) from e
    except openai.RateLimitError as e:
        logger.warning("Rate limit reached (429):%s", e)
        raise HTTPException(
            status_code=429,
            detail="Rate limit reached. Try again later."
        ) from e
    except VerdictMismatch as e:
        logger.warning("Verdicts and requirements mismatch (502):%s", e)
        raise HTTPException(
            status_code=502,
            detail="Matching failed. Try again."
        ) from e
    except ValidationError as e:
        logger.warning("Gateway gave a bad response (502):%s", e)
        raise HTTPException(
            status_code=502,
            detail="Matching failed. Try again."
        ) from e

    return MatchResponse(**result.model_dump(), score=score(result.verdicts))