# ECR Repository - Backend API
resource "aws_ecr_repository" "main" {
  name                 = "drawing-agent"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    Name = "drawing-agent"
  }
}

# Lifecycle policy - keep last 5 images
resource "aws_ecr_lifecycle_policy" "main" {
  repository = aws_ecr_repository.main.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 5 images"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = 5
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}

# ECR Repository - Web SSR Server
resource "aws_ecr_repository" "web_ssr" {
  name                 = "web-ssr"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    Name = "web-ssr"
  }
}

# Lifecycle policy - keep last 5 images
resource "aws_ecr_lifecycle_policy" "web_ssr" {
  repository = aws_ecr_repository.web_ssr.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 5 images"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = 5
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}
