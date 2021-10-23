/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software and associated documentation files (the "Software"), to deal in the Software
 * without restriction, including without limitation the rights to use, copy, modify,
 * merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
 * PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { MlOciStack } from '../lib/ml-oci-stack';
import { MlS3Stack } from '../lib/ml-s3-stack';
import { MlEfsStack } from '../lib/ml-efs-stack';

const app = new cdk.App();
new MlOciStack(app, 'MlOciStack', {
    description: 'Deploys two NLP models hosted on the OCI storage architecture to perform inference on AWS Lambda.',
    env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
},
    tags: {['purpose']: 'ml inference', ['version']: '1.0'}
});
new MlS3Stack(app, 'MlS3Stack', {
    description: 'Deploys one NLP model hosted on the S3 storage architecture to perform inference on AWS Lambda.',
    env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
},
    tags: {['purpose']: 'ml inference', ['version']: '1.0'}
});
new MlEfsStack(app, 'MlEfsStack', {
    description: 'Deploys two NLP models hosted on the EFS storage architecture to perform inference on AWS Lambda.',
    env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
},
    tags: {['purpose']: 'ml inference', ['version']: '1.0'}
});
