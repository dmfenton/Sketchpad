variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "production"
}

variable "domain_name" {
  description = "Root domain name (existing Route 53 hosted zone)"
  type        = string
  default     = "dmfenton.net"
}

variable "subdomain" {
  description = "Subdomain for the application"
  type        = string
  default     = "drawing-agent"
}

variable "instance_type" {
  description = "EC2 instance type (t3.medium recommended for production)"
  type        = string
  default     = "t3.medium"  # 4GB RAM - sufficient headroom for Python + Docker + agents
}

variable "ssh_key_name" {
  description = "Name of existing EC2 key pair for SSH access"
  type        = string
}

variable "alert_email" {
  description = "Email address for CloudWatch alerts"
  type        = string
}

variable "allowed_ssh_cidr" {
  description = "CIDR block allowed for SSH access (your IP, e.g., '203.0.113.0/32')"
  type        = string
  # No default - must be explicitly set to prevent accidental exposure
  # Use 'terraform plan -var="allowed_ssh_cidr=YOUR_IP/32"'

  validation {
    condition     = can(cidrhost(var.allowed_ssh_cidr, 0)) && var.allowed_ssh_cidr != "0.0.0.0/0"
    error_message = "allowed_ssh_cidr must be a valid CIDR block and cannot be 0.0.0.0/0 (open to world)"
  }
}

variable "ses_sender_email" {
  description = "Email address for sending magic links (must be on domain_name)"
  type        = string
  default     = "noreply@dmfenton.net"
}

variable "admin_ip" {
  description = "IP address allowed to access /analytics/ dashboard (e.g., '203.0.113.1')"
  type        = string

  validation {
    condition     = can(regex("^\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}$", var.admin_ip))
    error_message = "admin_ip must be a valid IPv4 address (e.g., '203.0.113.1')"
  }
}
