# Assistant — AWS Infrastructure

Minimal AWS setup: VPC, EC2 (t4g.small ARM), RDS Postgres (db.t4g.micro),
CloudFront + ACM, Secrets Manager.

## Cost estimate

| Component                  | Monthly |
|----------------------------|---------|
| EC2 t4g.small              | ~$12    |
| RDS db.t4g.micro + 20GB    | ~$15    |
| CloudFront (low traffic)   | ~$2     |
| Secrets Manager (1 secret) | ~$0.40  |
| Data transfer + EIP        | ~$5     |
| **Total**                  | **~$35-50** |

## One-time setup

1. **Create S3 bucket for Terraform state** (outside this Terraform):
   ```bash
   aws s3api create-bucket --bucket <your-tfstate-bucket> --region us-east-1
   aws s3api put-bucket-versioning --bucket <your-tfstate-bucket> \
     --versioning-configuration Status=Enabled
   ```

2. **Create a Route 53 hosted zone** for your domain if you don't have one.

3. **Generate SSH keypair**:
   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/assistant -C assistant
   ```

4. **Create `terraform.tfvars`**:
   ```hcl
   domain          = "assistant.example.com"
   hosted_zone_id  = "Z0123456789ABCDEF"
   ssh_pubkey      = "ssh-ed25519 AAAA... assistant"
   my_ip_cidr      = "203.0.113.42/32"   # your current IP
   ```

5. **Init + apply**:
   ```bash
   terraform init \
     -backend-config="bucket=<your-tfstate-bucket>" \
     -backend-config="key=assistant/terraform.tfstate" \
     -backend-config="region=us-east-1"
   terraform plan
   terraform apply
   ```

## Add additional secrets after first apply

```bash
SECRET_ARN=$(terraform output -raw secrets_arn)
aws secretsmanager get-secret-value --secret-id $SECRET_ARN --query SecretString --output text > /tmp/secrets.json

# Edit /tmp/secrets.json to add: ANTHROPIC_API_KEY, SLACK_SIGNING_SECRET, etc.

aws secretsmanager update-secret --secret-id $SECRET_ARN --secret-string file:///tmp/secrets.json
rm /tmp/secrets.json
```

## Deploy the app

After `terraform apply`:

```bash
EIP=$(terraform output -raw app_eip)
ssh -i ~/.ssh/assistant ubuntu@$EIP

# On the box:
sudo -u app -i
cd /opt/assistant
git clone <your-repo-url> .
npm ci
npm run build
eval "$(/usr/local/bin/assistant-env)"  # exports secrets as env vars
npm run db:migrate
pm2 start dist/main.js --name assistant-api --update-env
pm2 save
pm2 startup systemd -u app --hp /home/app
```

## Webhook endpoints

After deploy, configure these in each provider's settings:
- Slack: `https://<your-domain>/webhooks/slack/events`
- Notion: `https://<your-domain>/webhooks/notion`
- Gmail Pub/Sub: `https://<your-domain>/webhooks/gmail/push`

## Operational notes

- **Backups**: RDS automated 7-day retention. For longer retention, add a daily snapshot Lambda.
- **Updates**: `apt update && apt upgrade` monthly. Reboot during low-traffic window.
- **Monitoring**: CloudWatch alarms for EC2 CPU > 80%, RDS storage < 5GB free.
- **Deletion protection** on RDS is ON — disable in console before `terraform destroy`.
