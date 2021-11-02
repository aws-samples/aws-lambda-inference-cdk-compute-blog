# CDK ML Inference

This repo contains [AWS Cloud Development Kit (CDK)](https://aws.amazon.com/cdk/) package to deploy a Machiine Learning Inference HuggingFace Model to AWS Lambda on three different storage architectures, which are hosted on [Amazon EFS](https://aws.amazon.com/efs/), [Amazon S3](https://aws.amazon.com/s3/), and directly on to [AWS Lambda Open Container Initiatives](https://docs.aws.amazon.com/lambda/latest/dg/images-create.html). [Amazon API Gateway v2 (HTTP API)](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api.html) is used to perform the inference and to store the container images [Amazon ECR](https://aws.amazon.com/ecr/) is used. [AWS Cloud9](https://aws.amazon.com/cloud9) is used to perform the building and deployment via AWS CDK; however, any host machine which meets the requirements may be used for this.

For full details on how this works:

- [Read the AWS Compute Blog](https://aws.amazon.com/blogs/compute/choosing-between-storage-mechanisms-for-ml-inferencing-with-aws-lambda/)

**Important: this application uses various AWS services and there are costs associated with these services after the Free Tier usage - please see the [AWS Pricing page](https://aws.amazon.com/pricing/) for details. You are responsible for any AWS costs incurred. No warranty is implied in these examples.**

```bash
.
├── README.md                           <-- This instruction file
├── bin                                 <-- Folder which contains the primary infrastructure/starting point
│   └── ml-on-lambda.ts                 <-- Entrypoint of the CDK application, this is where three stacks are defined (S3, OCI, and EFS)
├── lib                                 <-- Contains all of the individual stack files
│   └── ml-efs-stack.ts                 <-- Deploys a ML Inference stack with EFS as the storage architecture, hosts two models
│   └── ml-oci-stack.ts                 <-- Deploys a ML Inference stack with OCI as the storage architecture, hosts two models
|   └── ml-s3-stack.ts                  <-- Deploys a ML Inference stack with S3 as the storage architecture, hosts one model
├── ml-images                           <-- Folder which contains the inference code for the AWS Lambda function along with the Dockerfiles
│   └── efs                             <-- Contains the EFS Lambda Function (Amazon EFS Arch)
|       └── app.py                      <-- Inference code for the Lambda function (EFS version)
|       └── Dockerfile                  <-- Dockerfile which builds the container
|       └── requirements.txt            <-- Pip requirements file for installing required packages
│   └── oci                             <-- Contains the AWS Lambda Function (OCI Arch)
|       └── app.py                      <-- Inference code for the Lambda function (OCI version)
|       └── Dockerfile                  <-- Dockerfile which builds the container
|       └── requirements.txt            <-- Pip requirements file for installing required packages
|   └── s3                              <-- Contains the AWS Lambda Function (Amazon S3 Arch)
|       └── nlp-models                  <-- Folder which contains the ml-models
|           └── nlp1                    <-- The first Q&A NLP Model (https://huggingface.co/distilbert-base-uncased-distilled-squad/)
|               └── nlp1-config.json                <-- Config file for BERT NLP Model (This file is not in the repo, see notes)
|               └── nlp1-pytorch_model.bin          <-- BERT NLP Model (This file is not in the repo, see notes)
|               └── nlp1-tokenizer_config.json      <-- Tokenizer config file for BERT NLP Model (This file is not in the repo, see notes)
|               └── nlp1-tokenizer.json             <-- Toeknizer file for BERT NLP Model (This file is not in the repo, see notes)
|       └── app.py                      <-- Inference code for the Lambda function (S3 version)
|       └── Dockerfile                  <-- Dockerfile which builds the container
|       └── requirements.txt            <-- Pip requirements file for installing required packages
```

## Requirements

- AWS Account
- Docker version 20.10 or greater
- AWS CLI v2.2 or greater
- NodeJS v14 or greater (nvm optional)
- Npm v6 or greater
- AWS CDK v2 rc20 or greater
- t3.medium or larger for building the Docker images
- Minimum 16 GB of disk space
- AWS ECR: Login via AWS CLI prior to building the AWS CDK code to push to an ECR repo
- AWS CDK: Set CDK_DEFAULT_ACCOUNT & CDK_DEFAULT_REGION to point to your account

## AWS Cloud9 Installation Instructions

These instructions are tailored for AWS Cloud9 which runs on Amazon Linux 2; however, it is
possible to deploying via other OS's provided all of the prerequistes are met, which are listed above.
Unless specified otherwise, all commands are run via a terminal window.

1. [Create an AWS Cloud9 Instance a t3.medium](https://docs.aws.amazon.com/cloud9/latest/user-guide/create-environment.html) or larger will work with Amazon Linux 2
1. Resize your EBS Volume by running the [resize script](https://docs.aws.amazon.com/cloud9/latest/user-guide/move-environment.html#move-environment-resize), minimum size required is 16 GB, 20 GB recommended or more, script below for convenience:

```bash
#!/bin/bash

# Specify the desired volume size in GiB as a command line argument. If not specified, default to 20 GiB.
SIZE=${1:-20}

# Get the ID of the environment host Amazon EC2 instance.
INSTANCEID=$(curl http://169.254.169.254/latest/meta-data/instance-id)
REGION=$(curl -s http://169.254.169.254/latest/meta-data/placement/availability-zone | sed 's/\(.*\)[a-z]/\1/')

# Get the ID of the Amazon EBS volume associated with the instance.
VOLUMEID=$(aws ec2 describe-instances \
  --instance-id $INSTANCEID \
  --query "Reservations[0].Instances[0].BlockDeviceMappings[0].Ebs.VolumeId" \
  --output text \
  --region $REGION)

# Resize the EBS volume.
aws ec2 modify-volume --volume-id $VOLUMEID --size $SIZE

# Wait for the resize to finish.
while [ \
  "$(aws ec2 describe-volumes-modifications \
    --volume-id $VOLUMEID \
    --filters Name=modification-state,Values="optimizing","completed" \
    --query "length(VolumesModifications)"\
    --output text)" != "1" ]; do
sleep 1
done

#Check if we're on an NVMe filesystem
if [[ -e "/dev/xvda" && $(readlink -f /dev/xvda) = "/dev/xvda" ]]
then
  # Rewrite the partition table so that the partition takes up all the space that it can.
  sudo growpart /dev/xvda 1

  # Expand the size of the file system.
  # Check if we're on AL2
  STR=$(cat /etc/os-release)
  SUB="VERSION_ID=\"2\""
  if [[ "$STR" == *"$SUB"* ]]
  then
    sudo xfs_growfs -d /
  else
    sudo resize2fs /dev/xvda1
  fi

else
  # Rewrite the partition table so that the partition takes up all the space that it can.
  sudo growpart /dev/nvme0n1 1

  # Expand the size of the file system.
  # Check if we're on AL2
  STR=$(cat /etc/os-release)
  SUB="VERSION_ID=\"2\""
  if [[ "$STR" == *"$SUB"* ]]
  then
    sudo xfs_growfs -d /
  else
    sudo resize2fs /dev/nvme0n1p1
  fi
fi
```

1. Open the terminal window and install NodeJS LTS (v14) by entering: `nvm install --lts`
1. Enable Node v14 by entering: `nvm use v14`
1. [Install AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html) _Run script below for convenience_

```bash
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install
```

1. [Install CDK v2](https://www.npmjs.com/package/aws-cdk/v/2.0.0-rc.21) via npm by running: `npm install --global aws-cdk@next`
1. Export your account number to a variable by running: `export CDK_DEFAULT_ACCOUNT=123456790191`
1. Export your region to a variable export by running: `CDK_DEFAULT_REGION=us-east-1`
1. Clone the github repo: `git clone`
1. Install the package dependencies by running: `npm install`
1. Login to Amazon ECR with the following command: `aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin $CDK_DEFAULT_ACCOUNT.dkr.ecr.$CDK_DEFAULT_REGION.amazonaws.com`
1. The AWS CDK needs to bootstrap your AWS account, run: `cdk bootstrap`
1. To deploy the Amazon EFS Architecture run: `cdk deploy MlEfsStack`
1. To deploy the Amazon S3 Architecture run: `cdk deploy MlS3Stack`
1. To deploy the Lambda OCI Architecture run: `cdk deploy MlOciStack`
1. Once the stack is deployed, check the Outputs tab for each stack for the sample request. _Note: This will be output in your terminal window after the stack is deployed_

### Important note about MlS3Stack

The model files are not included in the ./ml-images/s3/nlp-models/nlp1 directory due to the file sizes of the model. You will need to download four files and place them in this directory prior to running `cdk deploy MlS3Stack`. The model files which were used in the AWS Compute Blog were as follows:

- https://huggingface.co/distilbert-base-uncased-distilled-squad/resolve/main/pytorch_model.bin
- https://huggingface.co/distilbert-base-uncased-distilled-squad/resolve/main/config.json
- https://huggingface.co/distilbert-base-uncased-distilled-squad/resolve/main/tokenizer.json
- https://huggingface.co/distilbert-base-uncased-distilled-squad/resolve/main/tokenizer_config.json

## How it works

For full details on how this works: [Read the AWS Compute Blog](https://aws.amazon.com/blogs/compute/choosing-between-storage-mechanisms-for-ml-inferencing-with-aws-lambda/)

- Read the Compute Blog post

## Testing

There are three ways to test the AWS Lambda function. Via the AWS Management Console, via the AWS CLI, or via Amazon API Gateway.

### Test via the AWS Management Console

From the AWS Lambda page:

1. Navigate to the AWS Lambda service page
1. Click on your function name
1. Click on the **Test** heading
1. In the Test event section, enter the following code

```json
{
  "body": "{\"model_type\": \"nlp1\",\"question\": \"When was the car invented?\",\"context\": \"Cars came into global use during the 20th century, and developed economies depend on them. The year 1886 is regarded as the birth year of the modern car when German inventor Karl Benz patented his Benz Patent-Motorwagen. Cars became widely available in the early 20th century. One of the first cars accessible to the masses was the 1908 Model T, an American car manufactured by the Ford Motor Company. Cars were rapidly adopted in the US, where they replaced animal-drawn carriages and carts, but took much longer to be accepted in Western Europe and other parts of the world.\"}"
}
```

### Test via the AWS CLI

1. Run the following command from your terminal window

```bash
aws lambda invoke \
    --cli-binary-format raw-in-base64-out \
    --function-name MlFunctionName \
    --payload '{
  "body": "{\"model_type\": \"nlp1\",\"question\": \"Who invented the car?\",\"context\": \"Cars came into global use during the 20th century, and developed economies depend on them. The year 1886 is regarded as the birth year of the modern car when German inventor Karl Benz patented his Benz Patent-Motorwagen. Cars became widely available in the early 20th century. One of the first cars accessible to the masses was the 1908 Model T, an American car manufactured by the Ford Motor Company. Cars were rapidly adopted in the US, where they replaced animal-drawn carriages and carts, but took much longer to be accepted in Western Europe and other parts of the world.\"}"
  }' \
    response.json
```

### Test via Amazon API Gateway

Run the following command (be sure to replace with your API Endpoint and Region)

curl --location --request POST 'https://asdf.execute-api.us-east-1.amazonaws.com/develop/' --header 'Content-Type: application/json' --data-raw '{"model_type": "nlp1","question": "When was the car invented?","context": "Cars came into global use during the 20th century, and developed economies depend on them. The year 1886 is regarded as the birth year of the modern car when German inventor Karl Benz patented his Benz Patent-Motorwagen. Cars became widely available in the early 20th century. One of the first cars accessible to the masses was the 1908 Model T, an American car manufactured by the Ford Motor Company. Cars were rapidly adopted in the US, where they replaced animal-drawn carriages and carts, but took much longer to be accepted in Western Europe and other parts of the world."}'

## Destroying a stack / Teardown

To destroy any stack simply run: `cdk destroy StackName`

## Questions?

Please raise an issue on this repo.

==============================================

Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.

SPDX-License-Identifier: MIT-0
