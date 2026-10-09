"""Process entrypoint: ``python -m app``. Host and port come from the platform configuration."""

import uvicorn

from app.config import load_platform_config, load_settings
from app.main import create_app


def main() -> None:
    settings = load_settings()
    config = load_platform_config(settings.config_file)
    app = create_app(config, settings)
    # log_config=None keeps uvicorn from replacing the JSON logging;
    # access lines come from our own middleware.
    uvicorn.run(
        app, host=config.server.host, port=config.server.port, log_config=None, access_log=False
    )


if __name__ == "__main__":
    main()
