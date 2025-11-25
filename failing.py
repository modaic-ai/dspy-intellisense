import dspy


class SubQuerySummarizer(dspy.Signature):
    """
    You are about to complete a table-based question answernig task using the following two types of reference materials:

    Note:
    1. The markdown table content in Original Content may be incomplete.
    2. You should cross-validate the given two materials:
        - if the answers are the same, directly output the answer.
        - if the "SQL execution result" contains error or is empty, you should try to answer based on the Original Content.
        - if the two materials shows conflit, you should think about each of them, and finally give an answer.
    """

    original_content = dspy.InputField(
        desc="Content 1: Original content (table content is provided in Markdown format)"
    )
    table_schema = dspy.InputField(desc="The user given table schema")
    gnerated_sql = dspy.InputField(
        desc="SQL generated based on the schema and the user question"
    )
    sql_execute_result = dspy.InputField(desc="SQL execution results")
    user_query = dspy.InputField(desc="The user's question")
    answer = dspy.OutputField(desc="Answer to the user's question")


sqs = dspy.Predict(SubQuerySummarizer)

result = sqs(
    original_content="",
    table_schema="",
    gnerated_sql="",
    sql_execute_result="",
    user_query="",
)
