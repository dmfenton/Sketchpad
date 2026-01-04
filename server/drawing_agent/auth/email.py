"""Email service for sending magic links via AWS SES."""

import logging
from typing import Any

import boto3
from botocore.exceptions import ClientError

from drawing_agent.config import settings

logger = logging.getLogger(__name__)


def get_ses_client() -> Any:
    """Get boto3 SES client."""
    return boto3.client("ses", region_name=settings.ses_region)


def send_magic_link_email(to_email: str, magic_link_url: str) -> bool:
    """Send a magic link email via AWS SES.

    Returns True if email was sent successfully, False otherwise.
    Uses the EC2 instance role for credentials (no explicit keys needed).
    """
    ses = get_ses_client()

    subject = "Sign in to Code Monet"
    html_body = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
    <h1 style="color: #333; font-size: 24px;">Sign in to Code Monet</h1>
    <p style="color: #666; font-size: 16px; line-height: 1.5;">
        Click the button below to sign in. This link expires in {settings.magic_link_expire_minutes} minutes.
    </p>
    <p style="margin: 30px 0;">
        <a href="{magic_link_url}"
           style="background-color: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-size: 16px;">
            Sign In
        </a>
    </p>
    <p style="color: #999; font-size: 14px;">
        If you didn't request this email, you can safely ignore it.
    </p>
    <p style="color: #999; font-size: 12px; margin-top: 40px;">
        If the button doesn't work, copy and paste this link into your browser:<br>
        <a href="{magic_link_url}" style="color: #666;">{magic_link_url}</a>
    </p>
</body>
</html>
"""

    text_body = f"""Sign in to Code Monet

Click the link below to sign in. This link expires in {settings.magic_link_expire_minutes} minutes.

{magic_link_url}

If you didn't request this email, you can safely ignore it.
"""

    try:
        response = ses.send_email(
            Source=settings.ses_sender_email,
            Destination={"ToAddresses": [to_email]},
            Message={
                "Subject": {"Data": subject, "Charset": "UTF-8"},
                "Body": {
                    "Text": {"Data": text_body, "Charset": "UTF-8"},
                    "Html": {"Data": html_body, "Charset": "UTF-8"},
                },
            },
            ConfigurationSetName=settings.ses_configuration_set,
        )
        logger.info(f"Magic link email sent to {to_email}, MessageId: {response['MessageId']}")
        return True
    except ClientError as e:
        error_code = e.response.get("Error", {}).get("Code", "Unknown")
        error_message = e.response.get("Error", {}).get("Message", str(e))
        logger.error(
            f"Failed to send magic link email to {to_email}: {error_code} - {error_message}"
        )
        return False
    except Exception as e:
        logger.error(f"Unexpected error sending magic link email to {to_email}: {e}")
        return False
