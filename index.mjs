import axios from "axios";
import cheerio from "cheerio";
import AWS from "aws-sdk";
import { diffArrays } from "diff";

const s3 = new AWS.S3();
const bucketName = "uci-cinemas-imax-scraper-bucket"; // Sostituisci con il nome del tuo bucket S3
const scrapedDataFolderPath = "scraped-data";
const updatesFolderPath = "differences-data";
const url = "https://imax.ucicinemas.it/";

async function getHTML() {
  const { data: html } = await axios.get(url);
  return html;
}

function getMovieScript(input, startStr, endStr) {
  let startIndex = input.indexOf(startStr);
  let endIndex = input.indexOf(endStr, startIndex + startStr.length);

  return startIndex !== -1 && endIndex !== -1 && startIndex < endIndex
    ? input.substring(startIndex + startStr.length, endIndex)
    : null;
}

function getNewFilmSchema(days) {
  const outputList = [];

  for (const cinemaKey in days) {
    const eventsList = days[cinemaKey];
    const cinemaName = cinemaKey
      .replace("_", " ")
      .replace("-", " ")
      .replace(/\d+/g, "")
      .trim()
      .replace(/(?:^|\s)\S/g, (a) => a.toUpperCase())
      .replace(/\b(\w)/g, (match) => match.toUpperCase())
      .replace(/-(\w)/g, (match, group1) => ` ${group1.toUpperCase()}`);

    for (const event of eventsList) {
      const date = event.date;

      for (const timeInfo of event.events) {
        const movieTitle = timeInfo.movieTitle;

        for (const time of timeInfo.times) {
          outputList.push({
            movieTitle: movieTitle,
            date: date,
            time: time.time || "N/A",
            cinemaName: cinemaName || "N/A",
          });
        }
      }
    }
  }
  return outputList;
}

async function saveToFile(data, filePath) {
  const params = {
    Bucket: bucketName,
    Key: filePath,
    Body: JSON.stringify(data, null, 2),
  };

  await s3.upload(params).promise();
}

function compareLatestTwoFiles(scrapedDataFolderPath) {
  const params = {
    Bucket: bucketName,
    Prefix: scrapedDataFolderPath,
  };

  s3.listObjectsV2(params, async (err, data) => {
    if (err) {
      console.error("Errore nel recupero dei file da S3:", err);
      return;
    }

    const scrapedDataFiles = data.Contents.sort(
      (a, b) => b.LastModified - a.LastModified
    );
    const [latestFile, penultimateFile] = scrapedDataFiles.slice(0, 2);

    if (latestFile && penultimateFile) {
      const latestFilePath = latestFile.Key;
      const penultimateFilePath = penultimateFile.Key;

      try {
        const latestData = JSON.parse(
          (
            await s3
              .getObject({ Bucket: bucketName, Key: latestFilePath })
              .promise()
          ).Body.toString()
        );
        const penultimateData = JSON.parse(
          (
            await s3
              .getObject({ Bucket: bucketName, Key: penultimateFilePath })
              .promise()
          ).Body.toString()
        );

        const differences = diffArrays(penultimateData, latestData, {
          comparator: (a, b) => a.movieTitle === b.movieTitle,
        });

        console.log("Comparing:", penultimateFilePath, "and", latestFilePath);

        if (differences.some((part) => part.added || part.removed)) {
          console.log("Differences detected.");
          await saveDifferencesToFile(differences);
        } else {
          console.log("No differences found.");
        }
      } catch (error) {
        console.error("Errore nella lettura dei file da S3:", error);
      }
    } else {
      console.log("Not enough files for comparison.");
    }
  });
}

async function saveDifferencesToFile(differences) {
  try {
    const timestamp = new Date()
      .toISOString()
      .replace(/:/g, "-")
      .replace(/\./g, "-");
    const differencesFilePath = `${updatesFolderPath}/differences_${timestamp}.json`;

    const filteredDifferences = differences.filter(
      (part) => part.added || part.removed
    );

    await saveToFile(filteredDifferences, differencesFilePath);
    console.log("Differences saved to:", differencesFilePath);
  } catch (error) {
    console.error("Error saving differences to file:", error);
  }
}

export const handler = async (event) => {
  try {
    const timestamp = new Date()
      .toISOString()
      .replace(/:/g, "-")
      .replace(/\./g, "-");
    const newScrapedDataFilePath = `${scrapedDataFolderPath}/scraped-data_${timestamp}.json`;

    const res = await getHTML();
    const $ = cheerio.load(res, { xmlMode: false });
    const script = $("script").text();
    const moviesScript = getMovieScript(
      script,
      "moment.locale('it')",
      "function gotToBuyPage(pid) {"
    );

    eval(moviesScript);

    const TIMES = times,
      MOVIES = movies,
      DAYS = days;

    const newFilmSchema = getNewFilmSchema(DAYS);

    await saveToFile(newFilmSchema, newScrapedDataFilePath);
    console.log("New data saved to:", newScrapedDataFilePath);

    compareLatestTwoFiles(scrapedDataFolderPath);
  } catch (error) {
    console.error("Error in Lambda function:", error);
  }
};
