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
import {
  Duration,
  Stack,
  StackProps,
  CfnOutput,
  RemovalPolicy,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import { aws_lambda as lambda } from "aws-cdk-lib";
import { aws_apigatewayv2 as apigw } from "aws-cdk-lib";
import { aws_iam as iam } from "aws-cdk-lib";
import { aws_efs as efs } from "aws-cdk-lib";
import { aws_ec2 as ec2 } from "aws-cdk-lib";
import * as path from "path";

export class MlEfsStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Create VPC for EFS
    const mlVpc = new ec2.Vpc(this, "MLVpc");

    // Create EFS File System
    const fileSystem = new efs.FileSystem(this, "MlEfsFileSystem", {
      vpc: mlVpc,
      lifecyclePolicy: efs.LifecyclePolicy.AFTER_14_DAYS, // files are not transitioned to infrequent access (IA) storage by default
      performanceMode: efs.PerformanceMode.GENERAL_PURPOSE, // default
      removalPolicy: RemovalPolicy.DESTROY,
    });
    // Lambda needs an access point from the EFS filesystem
    const mlAccessPoint = fileSystem.addAccessPoint("MLAccessPoint", {
      // set /lambda as the root of the access point
      path: "/lambda",
      // as /lambda does not exist in a new efs filesystem, the efs will create the directory with the following createAcl
      createAcl: {
        ownerUid: "1001",
        ownerGid: "1001",
        permissions: "750",
      },
      // enforce the POSIX identity so lambda function will access with this identity
      posixUser: {
        uid: "1001",
        gid: "1001",
      },
    });

    // Create Lambda function from the DockerImage with EFS configuration
    const dockerFile = path.join(__dirname, "../ml-images/efs");
    const lambdaFunc = new lambda.DockerImageFunction(this, "MlLambdaEfs", {
      vpc: mlVpc,
      filesystem: lambda.FileSystem.fromEfsAccessPoint(
        mlAccessPoint,
        "/mnt/lambda"
      ),
      code: lambda.DockerImageCode.fromImageAsset(dockerFile),
      environment: {
        ["POWERTOOLS_METRICS_NAMESPACE"]: "ServerlessMlBertEfs",
        ["POWERTOOLS_SERVICE_NAME"]: "inference",
      },
      memorySize: 6000,
      timeout: Duration.seconds(180),
      description:
        "Pytorch BERT NLP Model deployed as a Docker Image (OCI) with EFS",
    });

    // Deploy APIGW
    const api = new apigw.CfnApi(this, "mlefsapi", {
      name: "mlefsapi",
      description: "ML API Inference EFS",
      protocolType: "HTTP",
    });

    const integration = new apigw.CfnIntegration(this, "mlefsinteg", {
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

    const routes = new apigw.CfnRoute(this, "mlefsroutes", {
      apiId: api.ref,
      routeKey: "POST /",
      target: "integrations/" + integration.ref,
    });

    const stage = new apigw.CfnStage(this, "mlefsstage", {
      apiId: api.ref,
      stageName: "develop",
      autoDeploy: true,
      description: "Stage for ml models (EFS)",
    });

    // Add permission to Lambda function to allow access from API Gateway
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

    lambdaFunc.addPermission("api-invocation-efs", {
      principal: servicePrincipal,
      sourceArn: apiArn,
      sourceAccount: props?.env?.account,
    });

    // Output Lambda info
    new CfnOutput(this, "LambdaName", {
      description: "Lambda Function Name",
      value: lambdaFunc.functionName,
    });

    // Output HTTP URL
    new CfnOutput(this, "ApiUrlEfs", {
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
    });

    // Sample Request
    new CfnOutput(this, "CurlRequestEfs", {
      description: "Manual curl request",
      value:
        "curl --location --request POST 'https://" +
        api.ref +
        ".execute-api." +
        props?.env?.region +
        '.amazonaws.com/develop/\' --header \'Content-Type: application/json\' --data-raw \'{"model_type": "nlp1","question": "When was the car invented?","context": "Cars came into global use during the 20th century, and developed economies depend on them. The year 1886 is regarded as the birth year of the modern car when German inventor Karl Benz patented his Benz Patent-Motorwagen. Cars became widely available in the early 20th century. One of the first cars accessible to the masses was the 1908 Model T, an American car manufactured by the Ford Motor Company. Cars were rapidly adopted in the US, where they replaced animal-drawn carriages and carts, but took much longer to be accepted in Western Europe and other parts of the world."}\'',
    });
  }
}
