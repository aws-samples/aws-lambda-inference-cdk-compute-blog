"""
Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: MIT-0

Permission is hereby granted, free of charge, to any person obtaining a copy of this
software and associated documentation files (the "Software"), to deal in the Software
without restriction, including without limitation the rights to use, copy, modify,
merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
"""
import json
from transformers import AutoTokenizer, AutoModelForQuestionAnswering
from aws_lambda_powertools import Metrics, Logger, Tracer
from aws_lambda_powertools.metrics import MetricUnit
import os
import boto3
import torch

# Lambda Powertools Setup
logger = Logger()
tracer = Tracer()
metrics = Metrics()

# Use tmp directory for model storage from S3.
MODEL_NLP_DIR = ("/tmp/nlp1/")
s3 = boto3.resource('s3')


# Downloads the correct model from Amazon S3
@tracer.capture_method
def util_dl_s3_model():
    logger.info('Download model files from S3')
    if not os.path.isdir(MODEL_NLP_DIR):
        os.mkdir(MODEL_NLP_DIR)
        logger.info('Created folder: ' + MODEL_NLP_DIR)
    else:
        logger.info('Folder already exists: ' + MODEL_NLP_DIR)
    s3.meta.client.download_file(os.environ['S3_MODEL_BUCKET_NAME'], os.environ['S3_NLP1_MODEL'], '/tmp/nlp1/pytorch_model.bin')
    s3.meta.client.download_file(os.environ['S3_MODEL_BUCKET_NAME'], os.environ['S3_NLP1_CONFIG'], '/tmp/nlp1/config.json')
    s3.meta.client.download_file(os.environ['S3_MODEL_BUCKET_NAME'], os.environ['S3_NLP1_TOKENIZER'], '/tmp/nlp1/tokenizer.json')
    s3.meta.client.download_file(os.environ['S3_MODEL_BUCKET_NAME'], os.environ['S3_NLP1_TOKENIZER_CONFIG'], '/tmp/nlp1/tokenizer_config.json')
    tokenizer = AutoTokenizer.from_pretrained("/tmp/nlp1/")
    model = AutoModelForQuestionAnswering.from_pretrained("/tmp/nlp1/")
    return [model, tokenizer]
    
# Load the model outside of handler (Single Model Inference)
loaded_model_tokenizer = util_dl_s3_model()
    
@tracer.capture_lambda_handler
@metrics.log_metrics(capture_cold_start_metric=True)
@logger.inject_lambda_context(log_event=True)
def lambda_handler(event, context):
    body = json.loads(event['body'])
    
    question = body['question']
    context = body['context']
    
    # Gather the inputs
    inputs = loaded_model_tokenizer[1].encode_plus(question,context,add_special_tokens=True,return_tensors="pt")
    input_ids = inputs["input_ids"].tolist()[0]

    # Perform the inference
    output = loaded_model_tokenizer[0](**inputs)
    answer_start_scores = output.start_logits
    answer_end_scores = output.end_logits

    answer_start = torch.argmax(answer_start_scores)
    answer_end = torch.argmax(answer_end_scores) + 1
    
    answer = loaded_model_tokenizer[1].convert_tokens_to_string(loaded_model_tokenizer[1].convert_ids_to_tokens(input_ids[answer_start:answer_end]))

    print('Question: {0}, Answer: {1}'.format(question, answer))
    return {
        'statusCode': 200,
        'headers': {'Content-Type': 'application/json'},
        'body': json.dumps({
            'Question': question,
            'Answer': answer
        })
    }
