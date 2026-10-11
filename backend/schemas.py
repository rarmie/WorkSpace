from pydantic import BaseModel, Field, field_validator, HttpUrl, model_validator, StringConstraints
from typing import Self, Literal, Annotated

class HealthResponse(BaseModel):
    status: str

class ExtractRequest(BaseModel):
    text: str | None = Field(default=None, min_length=20, max_length=50_000)
    url: HttpUrl | None = None

    @field_validator("text", mode="before")
    @classmethod
    def trim_text(cls, value: object) -> object: 
        if isinstance(value, str):
            value = value.strip()

        return value
    
    @model_validator(mode="after")
    def check_value(self) -> Self:
        if self.text is None and self.url is None:
            raise ValueError("Send either text or url.")
        elif self.text is not None and self.url is not None:
            raise ValueError("Send either text or url, not both.")

        return self

class ExtractResponse(BaseModel):
    company: str | None = Field(
        default=None,
        description="The name of the company or organization offering the job."
    )
    role: str | None = Field(
        default=None,
        description="The exact job title or position being advertised."
    )
    salary: str | None = Field(
        default=None,
        description="The salary or compensation offered for the position, preserving the amount, currency, and pay period exactly as stated."
    )
    notes: str | None = Field(
        default=None,
        description="Extra information that may be useful to job applicant."
    )
    requirements: list[str] | None = Field(
        default=None,
        description="A list of explicit qualifications, skills, experience, education, certifications, or other requirements that applicants must or should have."
    )
    link: str | None = Field(
        default=None,
        description="The URL associated with the job posting or application, if explicitly provided in the input."
    )

class MatchRequest(BaseModel):
    resume: str = Field(min_length=500, max_length=15_000)
    role: str | None = Field(default=None, min_length=1, max_length=200)
    requirements: list[Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]] = Field(min_length=1, max_length=30)

    @field_validator("resume", mode="before")
    @classmethod
    def trim_resume(cls, value: object) -> object:
        if isinstance(value, str):
            value = value.strip()

        return value

class RequirementVerdict(BaseModel):
    requirement: str = Field(
        description="The requirement being judged, as given in the requirements list."
    ) 
    verdict: Literal["met", "partial", "missing"] = Field(
        description=("met: the resume shows the requirement in full. "
                    "partial: related evidence that falls short, such as fewer years, a similar tool, or coursework instead of work. " 
                    "missing: no evidence.")
    )
    reason: str = Field(
        description="One short sentence citing the resume evidence for the verdict, or stating none was found."
        )

class MatchResult(BaseModel):
    verdicts: list[RequirementVerdict] = Field(
        min_length=1,
        description="One verdict per requirement."
    ) 
    summary: str = Field(
        description="One or two sentences on overall fit: the strongest matches and the most important gaps."
        )

class MatchResponse(MatchResult):
    score: int = Field(
        ge=0, le=100
    )