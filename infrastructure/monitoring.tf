# SNS Topic for alerts
resource "aws_sns_topic" "alerts" {
  name = "drawing-agent-alerts"
}

# Email subscription
resource "aws_sns_topic_subscription" "email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# CPU High Alarm
resource "aws_cloudwatch_metric_alarm" "cpu_high" {
  alarm_name          = "drawing-agent-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "CPUUtilization"
  namespace           = "AWS/EC2"
  period              = 300
  statistic           = "Average"
  threshold           = 80
  alarm_description   = "CPU utilization > 80% for 10 minutes"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]

  dimensions = {
    InstanceId = aws_instance.main.id
  }

  tags = {
    Name = "drawing-agent-cpu-alarm"
  }
}

# Instance Status Check Alarm
resource "aws_cloudwatch_metric_alarm" "status_check" {
  alarm_name          = "drawing-agent-status-check"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "StatusCheckFailed"
  namespace           = "AWS/EC2"
  period              = 60
  statistic           = "Maximum"
  threshold           = 0
  alarm_description   = "Instance status check failed"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]

  dimensions = {
    InstanceId = aws_instance.main.id
  }

  tags = {
    Name = "drawing-agent-status-alarm"
  }
}

# Disk Usage Warning (early warning at 60%)
resource "aws_cloudwatch_metric_alarm" "disk_warning" {
  alarm_name          = "drawing-agent-disk-warning"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "disk_used_percent"
  namespace           = "CWAgent"
  period              = 300
  statistic           = "Average"
  threshold           = 60
  alarm_description   = "Early warning: Disk usage > 60%"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    InstanceId = aws_instance.main.id
    path       = "/"
    fstype     = "xfs"
  }

  treat_missing_data = "notBreaching"

  tags = {
    Name = "drawing-agent-disk-warning"
  }
}

# Disk Usage Alarm (requires CloudWatch agent)
resource "aws_cloudwatch_metric_alarm" "disk_high" {
  alarm_name          = "drawing-agent-disk-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "disk_used_percent"
  namespace           = "CWAgent"
  period              = 300
  statistic           = "Average"
  threshold           = 85
  alarm_description   = "Disk usage > 85%"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]

  dimensions = {
    InstanceId = aws_instance.main.id
    path       = "/"
    fstype     = "xfs"
  }

  # Don't fail if metric doesn't exist yet (CloudWatch agent not installed)
  treat_missing_data = "notBreaching"

  tags = {
    Name = "drawing-agent-disk-alarm"
  }
}

# Memory Usage Alarm (requires CloudWatch agent)
resource "aws_cloudwatch_metric_alarm" "memory_high" {
  alarm_name          = "drawing-agent-memory-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "mem_used_percent"
  namespace           = "CWAgent"
  period              = 300
  statistic           = "Average"
  threshold           = 90
  alarm_description   = "Memory usage > 90%"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]

  dimensions = {
    InstanceId = aws_instance.main.id
  }

  treat_missing_data = "notBreaching"

  tags = {
    Name = "drawing-agent-memory-alarm"
  }
}
