from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "development"  # development | production
    database_url: str = "sqlite:///./studio.db"
    secret_key: str = "dev-only-change-me-dev-only-change-me"
    access_token_minutes: int = 480
    admin_email: str = "admin@example.com"
    admin_password: str = "admin123"
    seed_demo_data: bool = True
    cors_origins: str = "http://localhost:3000"
    cookie_secure: bool = False
    login_max_failures: int = 5
    login_window_seconds: int = 300

    @property
    def is_prod(self) -> bool:
        return self.app_env == "production"


settings = Settings()


def assert_production_safe() -> None:
    """Refuse to boot in production with insecure defaults."""
    if not settings.is_prod:
        return
    problems = []
    if settings.secret_key.startswith("dev-only-change-me") or len(settings.secret_key) < 32:
        problems.append("SECRET_KEY must be set to a random string of at least 32 chars")
    if settings.admin_password == "admin123":
        problems.append("ADMIN_PASSWORD must be changed")
    if settings.seed_demo_data:
        problems.append("SEED_DEMO_DATA must be false")
    if not settings.cookie_secure:
        problems.append("COOKIE_SECURE must be true behind HTTPS")
    if problems:
        raise RuntimeError("Unsafe production config: " + "; ".join(problems))
