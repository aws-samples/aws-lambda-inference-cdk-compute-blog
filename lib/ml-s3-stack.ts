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
import { Duration, Stack, StackProps, CfnOutput } from "aws-cdk-lib";
import { Construct } from "constructs";
import { aws_iam as iam } from "aws-cdk-lib";
import { aws_lambda as lambda } from "aws-cdk-lib";
import { aws_apigatewayv2 as apigw } from "aws-cdk-lib";
import { aws_s3_assets as s3assets } from "aws-cdk-lib";
import * as path from "path";

export class MlS3Stack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const asset_nlp1_config = new s3assets.Asset(this, "ModelAssets1", {
      path: path.join(
        __dirname,
        "../ml-images/s3/nlp-models/nlp1/nlp1-config.json"
      ),
    });

    const asset_nlp1_model = new s3assets.Asset(this, "ModelAssets2", {
      path: path.join(
        __dirname,
        "../ml-images/s3/nlp-models/nlp1/nlp1-pytorch_model.bin"
      ),
    });

    const asset_nlp1_tokenizer = new s3assets.Asset(this, "ModelAssets3", {
      path: path.join(
        __dirname,
        "../ml-images/s3/nlp-models/nlp1/nlp1-tokenizer.json"
      ),
    });

    const asset_nlp1_tokenizer_config = new s3assets.Asset(
      this,
      "ModelAssets4",
      {
        path: path.join(
          __dirname,
          "../ml-images/s3/nlp-models/nlp1/nlp1-tokenizer_config.json"
        ),
      }
    );

    const dockerFile = path.join(__dirname, "../ml-images/s3");
    const lambdaFunc = new lambda.DockerImageFunction(this, "MlLambdaS3", {
      code: lambda.DockerImageCode.fromImageAsset(dockerFile),
      environment: {
        ["POWERTOOLS_METRICS_NAMESPACE"]: "ServerlessMlBertS3",
        ["POWERTOOLS_SERVICE_NAME"]: "inference",
        ["S3_MODEL_BUCKET_NAME"]: asset_nlp1_model.s3BucketName,
        ["S3_NLP1_MODEL"]: asset_nlp1_model.s3ObjectKey,
        ["S3_NLP1_CONFIG"]: asset_nlp1_config.s3ObjectKey,
        ["S3_NLP1_TOKENIZER"]: asset_nlp1_tokenizer.s3ObjectKey,
        ["S3_NLP1_TOKENIZER_CONFIG"]: asset_nlp1_tokenizer_config.s3ObjectKey,
      },
      memorySize: 6000,
      timeout: Duration.seconds(180),
      description:
        "Pytorch BERT NLP Model deployed as a Docker Image (OCI) using S3",
    });

    // Deploy APIGW
    const api = new apigw.CfnApi(this, "MlApiS3", {
      name: "mls3api",
      description: "ML API Inference S3",
      protocolType: "HTTP",
    });

    const integration = new apigw.CfnIntegration(this, "MlIntegS3", {
      apiId: api.ref,
      integrationType: "AWS_PROXY",
      integrationUri:
        "arn:aws:apigateway:" +
        props?.env?.region +
        ":lambda:path/2015-03-31/functions/" +
        lambdaFunc.functionArn +
        "/invocations",
      payloadFormatVersion: "2.0",
      integrationMethod: "POST",
    });

    const routes = new apigw.CfnRoute(this, "MlS3Routes", {
      apiId: api.ref,
      routeKey: "POST /",
      target: "integrations/" + integration.ref,
    });

    const stage = new apigw.CfnStage(this, "MlS3Stage", {
      apiId: api.ref,
      stageName: "develop",
      autoDeploy: true,
      description: "Stage for ml models (S3)",
    });

    // Add permission to Lambda function
    const servicePrincipal = new iam.ServicePrincipal(
      "apigateway.amazonaws.com"
    );
    const apiArn =
      "arn:aws:execute-api:" +
      props?.env?.region +
      ":" +
      props?.env?.account +
      ":" +
      api.ref +
      "/*/*/";

    lambdaFunc.addPermission("api-invocation-s3", {
      principal: servicePrincipal,
      sourceArn: apiArn,
      sourceAccount: props?.env?.account,
    });

    // Generate ARNs for permissions
    const nlp1_config_arn =
      "arn:aws:s3:::" +
      asset_nlp1_config.s3BucketName +
      "/" +
      asset_nlp1_config.s3ObjectKey;
    const nlp1_model_arn =
      "arn:aws:s3:::" +
      asset_nlp1_model.s3BucketName +
      "/" +
      asset_nlp1_model.s3ObjectKey;
    const nlp1_tokenizer_arn =
      "arn:aws:s3:::" +
      asset_nlp1_tokenizer.s3BucketName +
      "/" +
      asset_nlp1_tokenizer.s3ObjectKey;
    const nlp1_tokenizer_config_arn =
      "arn:aws:s3:::" +
      asset_nlp1_tokenizer_config.s3BucketName +
      "/" +
      asset_nlp1_tokenizer_config.s3ObjectKey;

    // Generate PolicyStatement for S3 Access
    const lambdaS3ReadAccess = new iam.PolicyStatement({
      actions: ["s3:GetObject"],
      resources: [
        nlp1_config_arn,
        nlp1_model_arn,
        nlp1_tokenizer_arn,
        nlp1_tokenizer_config_arn,
      ],
    });
    lambdaFunc.addToRolePolicy(lambdaS3ReadAccess);

    // Output Lambda info
    new CfnOutput(this, "LambdaName", {
      description: "Lambda Function Name",
      value: lambdaFunc.functionName,
    });

    // Output HTTP URL
    new CfnOutput(this, "ApiUrlS3", {
      description: "API Gateway Endpoint URL",
      value: [
        "https://",
        api.ref,
        ".execute-api.",
        props?.env?.region,
        ".amazonaws.com/",
        stage.stageName,
        "/",
      ].join(""),
      exportName: "api-url",
    });

    // Sample Request
    new CfnOutput(this, "CurlRequestS3", {
      description: "Manual curl request",
      value:
        "curl --location --request POST 'https://" +
        api.ref +
        ".execute-api." +
        props?.env?.region +
        '.amazonaws.com/develop/\' --header \'Content-Type: application/json\' --data-raw \'{"model_type": "nlp1","question": "When was the car invented?","context": "Cars came into global use during the 20th century, and developed economies depend on them. The year 1886 is regarded as the birth year of the modern car when German inventor Karl Benz patented his Benz Patent-Motorwagen. Cars became widely available in the early 20th century. One of the first cars accessible to the masses was the 1908 Model T, an American car manufactured by the Ford Motor Company. Cars were rapidly adopted in the US, where they replaced animal-drawn carriages and carts, but took much longer to be accepted in Western Europe and other parts of the world."}\'',
    });

    new CfnOutput(this, "S3Nlp1Model", { value: asset_nlp1_model.s3ObjectUrl });
    new CfnOutput(this, "S3Nlp1Tokenizer", {
      value: asset_nlp1_tokenizer.s3ObjectUrl,
    });
    new CfnOutput(this, "S3Nlp1TokenizerConfig", {
      value: asset_nlp1_tokenizer_config.s3ObjectUrl,
    });
    new CfnOutput(this, "S3Nlp1Config", {
      value: asset_nlp1_config.s3ObjectUrl,
    });
  }
}
