# Use existing hosted zone
data "aws_route53_zone" "main" {
  name = var.domain_name
}

# A record for subdomain
resource "aws_route53_record" "app" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = "${var.subdomain}.${var.domain_name}"
  type    = "A"
  ttl     = 300
  records = [aws_eip.main.public_ip]
}

# A record for analytics subdomain (Umami)
resource "aws_route53_record" "analytics" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = "analytics.${var.subdomain}.${var.domain_name}"
  type    = "A"
  ttl     = 300
  records = [aws_eip.main.public_ip]
}

# Google Search Console verification
resource "aws_route53_record" "google_site_verification" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = "${var.subdomain}.${var.domain_name}"
  type    = "TXT"
  ttl     = 300
  records = ["google-site-verification=LzyOlli7nfXGnuc-wg44xBW2ula8sIdbrlVaAGVTM9g"]
}
