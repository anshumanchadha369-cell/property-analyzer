class SourceNotConfigured(Exception):
    """Raised by a data-source client when its API key/token is missing.

    The analyze router maps this to a distinct not_configured status so the
    UI can say "add the key to enable" instead of showing an error.
    """
