# CloudWatch Log Groups for application logs

resource "aws_cloudwatch_log_group" "app" {
  name              = "/drawing-agent/app"
  retention_in_days = 30

  tags = {
    Name        = "drawing-agent-app-logs"
    Environment = "production"
  }
}

resource "aws_cloudwatch_log_group" "errors" {
  name              = "/drawing-agent/errors"
  retention_in_days = 90

  tags = {
    Name        = "drawing-agent-error-logs"
    Environment = "production"
  }
}

# Metric filter to count errors for alerting
resource "aws_cloudwatch_log_metric_filter" "error_count" {
  name           = "error-count"
  pattern        = "{ $.level = \"ERROR\" }"
  log_group_name = aws_cloudwatch_log_group.app.name

  metric_transformation {
    name          = "ErrorCount"
    namespace     = "DrawingAgent"
    value         = "1"
    default_value = "0"
  }
}

# Metric filter for auth failures
resource "aws_cloudwatch_log_metric_filter" "auth_failures" {
  name           = "auth-failures"
  pattern        = "{ $.category = \"auth\" && $.level = \"WARNING\" }"
  log_group_name = aws_cloudwatch_log_group.app.name

  metric_transformation {
    name          = "AuthFailureCount"
    namespace     = "DrawingAgent"
    value         = "1"
    default_value = "0"
  }
}

# Alarm for high error rate
resource "aws_cloudwatch_metric_alarm" "high_error_rate" {
  alarm_name          = "drawing-agent-high-error-rate"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "ErrorCount"
  namespace           = "DrawingAgent"
  period              = 300 # 5 minutes
  statistic           = "Sum"
  threshold           = 10
  alarm_description   = "More than 10 errors in 5 minutes"

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]

  tags = {
    Name = "drawing-agent-error-alarm"
  }
}
